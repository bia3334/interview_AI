import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { ElectronService } from './electron.service';

/**
 * Audio capture for realtime (streaming) transcription.
 *
 * Grabs the call audio via the same loopback trick as the other recorders,
 * but instead of recording files it converts the stream to 24 kHz mono PCM16
 * and pushes ~85 ms chunks to the main process, which relays them to the
 * OpenAI Realtime API. Utterance boundaries are decided server-side (VAD), so
 * this service does no segmentation of its own — it only reports a level for
 * the meter.
 *
 * The AudioContext runs at the device's native rate (48 kHz for WASAPI
 * loopback on Windows). Chromium delivers silence from a
 * MediaStreamAudioSourceNode when the context rate differs from the stream's,
 * so we resample to 24 kHz ourselves instead of asking the context to.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeListenerService {
  /** RMS level 0..1 of the incoming audio. */
  readonly level$ = new Subject<number>();
  /** Capture stopped on its own (e.g. the source track ended). */
  readonly ended$ = new Subject<string>();

  private static readonly TARGET_RATE = 24000;
  private static readonly BUFFER_SIZE = 4096; // ≈85 ms at 48 kHz

  private displayStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private capturing = false;
  private chunksSent = 0;
  /** Fractional read position carried across buffers so resampling is seamless. */
  private resamplePos = 0;
  private lastSample = 0;

  constructor(private electronService: ElectronService) {}

  get isCapturing(): boolean {
    return this.capturing;
  }

  async start(): Promise<void> {
    if (this.capturing) return;

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
      if (this.capturing) {
        this.stop();
        this.ended$.next('System audio capture ended.');
      }
    });

    this.audioContext = new AudioContext();
    await this.audioContext.resume();
    const inputRate = this.audioContext.sampleRate;
    console.log(`RealtimeListener: capturing at ${inputRate} Hz → ${RealtimeListenerService.TARGET_RATE} Hz`);

    this.source = this.audioContext.createMediaStreamSource(this.audioStream);
    this.processor = this.audioContext.createScriptProcessor(RealtimeListenerService.BUFFER_SIZE, 1, 1);
    // A ScriptProcessor only fires while connected to the graph; route it
    // through a muted gain so nothing is played back.
    this.sink = this.audioContext.createGain();
    this.sink.gain.value = 0;

    const ratio = inputRate / RealtimeListenerService.TARGET_RATE;
    this.resamplePos = 0;
    this.lastSample = 0;
    this.chunksSent = 0;

    this.processor.onaudioprocess = (event) => {
      if (!this.capturing) return;
      const input = event.inputBuffer.getChannelData(0);

      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      this.level$.next(rms);

      const pcm16 = this.resampleToPcm16(input, ratio);
      if (pcm16.length === 0) return;
      this.electronService.sendRealtimeAudio(pcm16.buffer as ArrayBuffer);

      this.chunksSent += 1;
      if (this.chunksSent === 1 || this.chunksSent % 120 === 0) {
        console.log(`RealtimeListener: chunk #${this.chunksSent}, ${pcm16.length} samples, rms=${rms.toFixed(4)}`);
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.sink);
    this.sink.connect(this.audioContext.destination);
    this.capturing = true;
  }

  stop(): void {
    this.capturing = false;
    this.cleanup();
    this.level$.next(0);
  }

  /**
   * Linear-interpolation resampler from the context rate down to 24 kHz.
   * Keeps a fractional position and the previous sample across calls so
   * consecutive buffers join without clicks.
   */
  private resampleToPcm16(input: Float32Array, ratio: number): Int16Array {
    if (ratio === 1) {
      const out = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) out[i] = RealtimeListenerService.toInt16(input[i]);
      return out;
    }

    // `pos` is the (fractional) input index of the next output sample; it
    // starts in [0, ratio) carried over from the previous buffer and ends in
    // the same range, so every index read below is inside this buffer.
    let pos = this.resamplePos;
    const count = Math.max(0, Math.ceil((input.length - pos) / ratio));
    const out = new Int16Array(count);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(pos);
      const frac = pos - idx;
      const a = idx > 0 ? input[idx - 1] : this.lastSample;
      const b = input[idx];
      out[i] = RealtimeListenerService.toInt16(a + (b - a) * frac);
      pos += ratio;
    }
    this.resamplePos = pos - input.length;
    this.lastSample = input[input.length - 1];
    return out;
  }

  private static toInt16(sample: number): number {
    const s = Math.max(-1, Math.min(1, sample));
    return s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  private cleanup(): void {
    if (this.processor) {
      this.processor.onaudioprocess = null;
      try { this.processor.disconnect(); } catch { /* ignore */ }
      this.processor = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch { /* ignore */ }
      this.source = null;
    }
    if (this.sink) {
      try { this.sink.disconnect(); } catch { /* ignore */ }
      this.sink = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
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
