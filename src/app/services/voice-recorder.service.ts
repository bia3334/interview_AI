import { Injectable } from '@angular/core';

const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/**
 * Captures system audio (Zoom / speakers) via getDisplayMedia + audio: 'loopback'
 * configured in the Electron main process. Returns an audio-only Blob on stop.
 */
@Injectable({ providedIn: 'root' })
export class VoiceRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private displayStream: MediaStream | null = null;
  private audioStream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private activeMimeType: string = 'audio/webm';
  private startTime: number = 0;

  get recording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  async start(): Promise<void> {
    if (this.recording) return;

    // The Electron main process intercepts this via setDisplayMediaRequestHandler
    // and supplies the primary screen source with audio: 'loopback'.
    // We don't keep the video tracks — only the audio.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: true,
    });
    this.displayStream = stream;

    // Discard video tracks immediately — we only need audio loopback.
    stream.getVideoTracks().forEach((track) => track.stop());

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      this.cleanup();
      throw new Error('No system audio track captured. Make sure something is playing through your speakers.');
    }

    this.audioStream = new MediaStream(audioTracks);
    this.activeMimeType =
      CANDIDATE_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || 'audio/webm';

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType: this.activeMimeType });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };
    this.mediaRecorder.start(500);
    this.startTime = Date.now();
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder || recorder.state === 'inactive') {
        this.cleanup();
        reject(new Error('No active recording'));
        return;
      }

      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.activeMimeType });
        const durationMs = Date.now() - this.startTime;
        const mimeType = this.activeMimeType;
        this.cleanup();
        resolve({ blob, mimeType, durationMs });
      };
      recorder.onerror = (event) => {
        this.cleanup();
        reject((event as any).error || new Error('Recording failed'));
      };

      recorder.stop();
    });
  }

  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.chunks = [];
    this.mediaRecorder = null;
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
