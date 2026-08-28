import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export interface AudioSegment {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Wall-clock time the segment's recording started. */
  startedAt: number;
}

/**
 * Continuous system-audio listener for interview mode.
 *
 * Captures the call audio (Zoom / Meet / Teams through the speakers) with the
 * same loopback trick as VoiceRecorderService, but instead of one start/stop
 * recording it runs forever and cuts the stream into utterances using a
 * simple energy-based voice-activity detector:
 *
 *   speech ──▶ ≥ SILENCE_MS of quiet ──▶ segment emitted ──▶ new recorder
 *
 * A MediaRecorder is always running, so the first syllable of each utterance
 * is never lost; on a cut the old recorder is stopped (its chunks become one
 * self-contained webm file) and a fresh one starts immediately. Segments with
 * no detected speech are discarded silently so the transcriber isn't paid to
 * listen to room tone.
 */
@Injectable({ providedIn: 'root' })
export class LiveListenerService {
  /** RMS level 0..1 of the incoming audio, ~20×/s while listening. */
  readonly level$ = new Subject<number>();
  /** Emitted once per detected utterance. */
  readonly segment$ = new Subject<AudioSegment>();
  /** Emitted when capture stops unexpectedly (e.g. the source track ended). */
  readonly ended$ = new Subject<string>();

  private static readonly POLL_MS = 50;
  /** Quiet period that ends an utterance. */
  private static readonly SILENCE_MS = 1100;
  /** Minimum cumulative speech for a segment to be worth transcribing. */
  private static readonly MIN_SPEECH_MS = 350;
  /** Hard cut so a long monologue still yields answers as it goes. */
  private static readonly MAX_SEGMENT_MS = 20000;
  /** Recycle a recorder that has heard nothing, to bound its buffer. */
  private static readonly IDLE_RESTART_MS = 15000;
  /** Floor for the speech threshold — below this is treated as noise. */
  private static readonly MIN_THRESHOLD = 0.012;

  private displayStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeDomain: Uint8Array<ArrayBuffer> | null = null;
  private monitorTimer: any = null;

  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mimeType = 'audio/webm';

  private listening = false;
  private segmentStartedAt = 0;
  private speechMs = 0;
  private speechActive = false;
  private lastSpeechAt = 0;
  private noiseFloor = 0.008;

  get isListening(): boolean {
    return this.listening;
  }

  async start(): Promise<void> {
    if (this.listening) return;

    // Main process answers this via setDisplayMediaRequestHandler with the
    // primary screen + audio: 'loopback'. Only the audio track is kept.
    const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
    this.displayStream = stream;
    stream.getVideoTracks().forEach((track) => track.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.cleanup();
      throw new Error('No system audio track captured. Make sure the call audio plays through your speakers.');
    }

    this.audioStream = new MediaStream(audioTracks);
    audioTracks[0].addEventListener('ended', () => {
      if (this.listening) {
        this.stop();
        this.ended$.next('System audio capture ended.');
      }
    });

    this.mimeType =
      CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(this.audioStream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    source.connect(this.analyser);
    this.timeDomain = new Uint8Array(this.analyser.fftSize) as Uint8Array<ArrayBuffer>;

    this.listening = true;
    this.noiseFloor = 0.008;
    this.startRecorder();
    this.monitorTimer = setInterval(() => this.tick(), LiveListenerService.POLL_MS);
  }

  stop(): void {
    if (!this.listening) {
      this.cleanup();
      return;
    }
    this.listening = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    // Flush whatever was being said when the user hit Stop.
    this.cutSegment(/* restart */ false);
    this.cleanup();
    this.level$.next(0);
  }

  // ---------------------------------------------------------------------
  // Voice activity detection
  // ---------------------------------------------------------------------

  private tick(): void {
    if (!this.analyser || !this.timeDomain || !this.listening) return;

    this.analyser.getByteTimeDomainData(this.timeDomain);
    let sum = 0;
    for (let i = 0; i < this.timeDomain.length; i++) {
      const v = (this.timeDomain[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this.timeDomain.length);
    this.level$.next(rms);

    const now = Date.now();
    const threshold = Math.max(LiveListenerService.MIN_THRESHOLD, this.noiseFloor * 3);

    if (rms > threshold) {
      this.speechActive = true;
      this.lastSpeechAt = now;
      this.speechMs += LiveListenerService.POLL_MS;
    } else {
      // Track the room's noise floor only while nobody is talking, so the
      // threshold adapts to a hum but never to speech itself.
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
      if (this.speechActive && now - this.lastSpeechAt >= LiveListenerService.SILENCE_MS) {
        this.speechActive = false;
        this.cutSegment(true);
        return;
      }
    }

    const segmentAge = now - this.segmentStartedAt;
    if (this.speechMs > 0 && segmentAge >= LiveListenerService.MAX_SEGMENT_MS) {
      this.cutSegment(true);
    } else if (this.speechMs === 0 && segmentAge >= LiveListenerService.IDLE_RESTART_MS) {
      this.cutSegment(true);
    }
  }

  // ---------------------------------------------------------------------
  // Recorder lifecycle
  // ---------------------------------------------------------------------

  private startRecorder(): void {
    if (!this.audioStream) return;
    this.chunks = [];
    this.speechMs = 0;
    this.speechActive = false;
    this.segmentStartedAt = Date.now();

    const recorder = new MediaRecorder(this.audioStream, { mimeType: this.mimeType });
    const chunks = this.chunks;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunks.push(event.data);
    };
    recorder.start(250);
    this.recorder = recorder;
  }

  /**
   * Finish the current recorder. Its chunks are emitted as one segment if it
   * contained enough speech; otherwise they're dropped. When `restart` is
   * true a new recorder starts immediately so no audio is missed.
   */
  private cutSegment(restart: boolean): void {
    const recorder = this.recorder;
    const chunks = this.chunks;
    const hadSpeech = this.speechMs >= LiveListenerService.MIN_SPEECH_MS;
    const startedAt = this.segmentStartedAt;
    const mimeType = this.mimeType;
    this.recorder = null;

    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        if (!hadSpeech || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType });
        this.segment$.next({
          blob,
          mimeType,
          durationMs: Date.now() - startedAt,
          startedAt,
        });
      };
      try {
        recorder.stop();
      } catch {
        // Recorder already torn down — nothing to flush.
      }
    }

    if (restart && this.listening) {
      this.startRecorder();
    }
  }

  private cleanup(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      try { this.recorder.stop(); } catch { /* ignore */ }
    }
    this.recorder = null;
    this.chunks = [];
    if (this.audioContext) {
      this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.analyser = null;
    this.timeDomain = null;
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => track.stop());
      this.audioStream = null;
    }
    if (this.displayStream) {
      this.displayStream.getTracks().forEach((track) => track.stop());
      this.displayStream = null;
    }
  }
}
