/**
 * Streaming speech-to-text over the OpenAI Realtime API (transcription
 * sessions). The renderer pushes 24 kHz mono PCM16 as it is captured; the
 * server streams back partial transcripts word by word, then a final
 * transcript per utterance.
 *
 * Two families of transcription model behave differently:
 *  - gpt-live-transcribe   — true streaming (deltas arrive as words are
 *    spoken) but does NOT support server turn detection. We run a small
 *    energy VAD on the audio passing through here and send
 *    `input_audio_buffer.commit` when the speaker pauses; the server then
 *    emits the `completed` transcript for that utterance.
 *  - gpt-4o(-mini)-transcribe — server VAD decides utterance boundaries and
 *    emits one `completed` per utterance (no deltas in practice).
 *
 * Lives in the main process so the API key never reaches the renderer and so
 * we can use the `ws` package (Electron's Node has no global WebSocket).
 */
import WebSocket from 'ws';
import type { TranscriptionLanguage } from './transcription';

export type RealtimeTranscriptEvent =
  | { type: 'ready'; model: string; clientVad: boolean }
  | { type: 'speech_started'; itemId?: string }
  | { type: 'speech_stopped'; itemId?: string }
  | { type: 'delta'; itemId: string; delta: string }
  | { type: 'completed'; itemId: string; transcript: string }
  | { type: 'error'; message: string }
  | { type: 'closed'; reason: string };

export interface RealtimeTranscriberOptions {
  apiKey: string;
  model: string;
  language: TranscriptionLanguage;
  /** Quiet period (ms) that ends an utterance (server VAD or our local VAD). */
  silenceDurationMs?: number;
  log: { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };
  onEvent: (event: RealtimeTranscriptEvent) => void;
}

export const REALTIME_TRANSCRIBE_MODELS = [
  'gpt-live-transcribe',
  'gpt-4o-mini-transcribe',
  'gpt-4o-transcribe',
] as const;

export const DEFAULT_REALTIME_TRANSCRIBE_MODEL = REALTIME_TRANSCRIBE_MODELS[0];

/** Models that stream deltas and need client-side turn detection. */
export function usesClientVad(model: string): boolean {
  return model === 'gpt-live-transcribe';
}

const REALTIME_URL = 'wss://api.openai.com/v1/realtime?intent=transcription';
const SAMPLE_RATE = 24000;
const DEFAULT_SILENCE_MS = 650;
/** Minimum cumulative speech before a pause is treated as an utterance. */
const MIN_SPEECH_MS = 300;
/** Force a commit on very long monologues so answers keep flowing. */
const MAX_UTTERANCE_MS = 25000;
const MIN_THRESHOLD = 0.012;

export class RealtimeTranscriber {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  /** Set once we've fallen back to the pre-GA event shape. */
  private legacy = false;
  private configured = false;
  private pendingAudio: Buffer[] = [];

  private audioChunks = 0;
  private audioBytes = 0;

  // Local VAD state (only used for client-VAD models)
  private readonly clientVad: boolean;
  private speechActive = false;
  private speechMs = 0;
  private lastSpeechAt = 0;
  private utteranceStartedAt = 0;
  private noiseFloor = 0.008;

  constructor(private readonly opts: RealtimeTranscriberOptions) {
    this.clientVad = usesClientVad(opts.model);
  }

  get isOpen(): boolean {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  start(): void {
    this.closedByUs = false;
    this.connect();
  }

  /** Queue or forward a chunk of 24 kHz mono PCM16. */
  sendAudio(pcm16: Buffer): void {
    if (!pcm16 || pcm16.length === 0) return;
    this.audioChunks += 1;
    this.audioBytes += pcm16.length;

    const rms = RealtimeTranscriber.rms(pcm16);
    if (this.audioChunks === 1 || this.audioChunks % 200 === 0) {
      this.opts.log.info(
        `Realtime STT audio: chunk #${this.audioChunks}, ${pcm16.length} bytes, rms=${rms.toFixed(3)}, total=${(this.audioBytes / (SAMPLE_RATE * 2)).toFixed(1)}s`
      );
    }

    if (!this.isOpen || !this.configured) {
      // Hold a little audio while the socket/session comes up so the first
      // words aren't lost; anything older than ~5s is dropped.
      this.pendingAudio.push(pcm16);
      if (this.pendingAudio.length > 60) this.pendingAudio.shift();
      return;
    }
    this.send({ type: 'input_audio_buffer.append', audio: pcm16.toString('base64') });
    if (this.clientVad) this.detectTurn(rms, pcm16.length / 2 / SAMPLE_RATE * 1000);
  }

  stop(): void {
    this.closedByUs = true;
    this.pendingAudio = [];
    if (this.ws) {
      try { this.ws.close(1000, 'client stop'); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  // ---------------------------------------------------------------------
  // Local turn detection (gpt-live-transcribe)
  // ---------------------------------------------------------------------

  private static rms(pcm16: Buffer): number {
    const n = Math.floor(pcm16.length / 2);
    if (n === 0) return 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = pcm16.readInt16LE(i * 2) / 32768;
      sum += v * v;
    }
    return Math.sqrt(sum / n);
  }

  private detectTurn(rms: number, chunkMs: number): void {
    const now = Date.now();
    const threshold = Math.max(MIN_THRESHOLD, this.noiseFloor * 3);

    if (rms > threshold) {
      if (!this.speechActive) {
        this.speechActive = true;
        if (this.speechMs === 0) this.utteranceStartedAt = now;
        this.opts.onEvent({ type: 'speech_started' });
      }
      this.lastSpeechAt = now;
      this.speechMs += chunkMs;
    } else {
      // Adapt to room tone only while nobody is talking.
      this.noiseFloor = this.noiseFloor * 0.95 + rms * 0.05;
      if (this.speechActive && now - this.lastSpeechAt >= (this.opts.silenceDurationMs ?? DEFAULT_SILENCE_MS)) {
        this.speechActive = false;
        this.opts.onEvent({ type: 'speech_stopped' });
        this.commitUtterance();
      }
    }

    if (this.speechMs > 0 && now - this.utteranceStartedAt >= MAX_UTTERANCE_MS) {
      this.commitUtterance();
    }
  }

  /** Ask the server to finalise the current buffer as one utterance. */
  private commitUtterance(): void {
    const hadSpeech = this.speechMs >= MIN_SPEECH_MS;
    this.speechMs = 0;
    this.speechActive = false;
    if (!hadSpeech) return; // committing near-silence just errors
    this.opts.log.info('Realtime STT: pause detected, committing utterance');
    this.send({ type: 'input_audio_buffer.commit' });
  }

  // ---------------------------------------------------------------------
  // Socket
  // ---------------------------------------------------------------------

  private connect(): void {
    const { apiKey, log } = this.opts;
    const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
    if (this.legacy) headers['OpenAI-Beta'] = 'realtime=v1';

    log.info(`Realtime STT: connecting (${this.legacy ? 'legacy' : 'GA'} protocol, model=${this.opts.model}, vad=${this.clientVad ? 'client' : 'server'})`);
    const ws = new WebSocket(REALTIME_URL, { headers });
    this.ws = ws;
    this.configured = false;

    ws.on('open', () => {
      if (this.ws !== ws) return;
      this.send(this.legacy ? this.legacySessionUpdate() : this.sessionUpdate());
    });

    ws.on('message', (data) => {
      if (this.ws !== ws) return;
      let msg: any;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      this.handleServerEvent(msg);
    });

    ws.on('error', (err) => {
      if (this.ws !== ws) return;
      log.error('Realtime STT socket error:', err);
      this.opts.onEvent({ type: 'error', message: err.message || 'WebSocket error' });
    });

    ws.on('close', (code, reason) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const why = reason?.toString() || `code ${code}`;
      log.info(`Realtime STT closed: ${why}`);
      if (!this.closedByUs) {
        this.opts.onEvent({ type: 'closed', reason: why });
      }
    });
  }

  private send(payload: any): void {
    if (!this.isOpen) return;
    try {
      this.ws!.send(JSON.stringify(payload));
    } catch (err) {
      this.opts.log.error('Realtime STT send failed:', err);
    }
  }

  private transcriptionConfig(): Record<string, any> {
    const cfg: Record<string, any> = { model: this.opts.model };
    if (this.opts.language !== 'auto') cfg.language = this.opts.language;
    return cfg;
  }

  /** Server VAD for the 4o models; null for gpt-live-transcribe (unsupported). */
  private turnDetection(): Record<string, any> | null {
    if (this.clientVad) return null;
    return {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: this.opts.silenceDurationMs ?? DEFAULT_SILENCE_MS,
    };
  }

  /** GA (2025-08+) shape: session.update with session.type = "transcription". */
  private sessionUpdate() {
    const turn = this.turnDetection();
    return {
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: SAMPLE_RATE },
            noise_reduction: { type: 'far_field' },
            transcription: this.transcriptionConfig(),
            turn_detection: turn ? { ...turn, create_response: false } : null,
          },
        },
      },
    };
  }

  /** Pre-GA shape kept as a fallback in case the account/region still speaks it. */
  private legacySessionUpdate() {
    return {
      type: 'transcription_session.update',
      session: {
        input_audio_format: 'pcm16',
        input_audio_transcription: this.transcriptionConfig(),
        turn_detection: this.turnDetection(),
        input_audio_noise_reduction: { type: 'far_field' },
      },
    };
  }

  private flushPendingAudio(): void {
    const queued = this.pendingAudio;
    this.pendingAudio = [];
    for (const chunk of queued) {
      this.send({ type: 'input_audio_buffer.append', audio: chunk.toString('base64') });
    }
  }

  private handleServerEvent(msg: any): void {
    const { log, onEvent } = this.opts;
    switch (msg.type) {
      case 'session.created':
      case 'transcription_session.created':
        // Wait for *.updated before streaming so our config is in force.
        break;

      case 'session.updated':
      case 'transcription_session.updated':
        this.configured = true;
        log.info('Realtime STT session ready');
        onEvent({ type: 'ready', model: this.opts.model, clientVad: this.clientVad });
        this.flushPendingAudio();
        break;

      case 'input_audio_buffer.speech_started':
        log.info('Realtime STT: speech started (server)');
        onEvent({ type: 'speech_started', itemId: msg.item_id });
        break;

      case 'input_audio_buffer.speech_stopped':
        log.info('Realtime STT: speech stopped (server)');
        onEvent({ type: 'speech_stopped', itemId: msg.item_id });
        break;

      case 'conversation.item.input_audio_transcription.delta':
        if (msg.delta) onEvent({ type: 'delta', itemId: msg.item_id, delta: msg.delta });
        break;

      case 'conversation.item.input_audio_transcription.completed':
        log.info(`Realtime STT: completed "${(msg.transcript || '').slice(0, 80)}"`);
        onEvent({ type: 'completed', itemId: msg.item_id, transcript: msg.transcript || '' });
        break;

      case 'conversation.item.input_audio_transcription.failed':
        onEvent({ type: 'error', message: msg.error?.message || 'Transcription failed' });
        break;

      case 'error': {
        const message: string = msg.error?.message || 'Realtime API error';
        log.error('Realtime STT error event:', message);
        // If the GA session shape was rejected before we ever got configured,
        // retry once with the legacy protocol.
        if (!this.configured && !this.legacy && /session|unknown|invalid|type/i.test(message)) {
          log.warn('Realtime STT: GA session rejected, retrying with legacy protocol');
          this.legacy = true;
          const old = this.ws;
          this.ws = null;
          try { old?.close(); } catch { /* ignore */ }
          this.connect();
          return;
        }
        // An empty-buffer commit is harmless noise, not something to show.
        if (/buffer.*(empty|too small)/i.test(message)) return;
        onEvent({ type: 'error', message });
        break;
      }

      default:
        break;
    }
  }
}
