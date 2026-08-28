/**
 * Voice-input IPC handlers: transcription + provider / language preferences.
 */
import { ipcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';
import {
  normalizeTranscriptionLanguage,
  transcribeAudio,
  TranscriptionLanguage,
  TranscriptionProvider,
} from '../audio/transcription';
import {
  DEFAULT_REALTIME_TRANSCRIBE_MODEL,
  REALTIME_TRANSCRIBE_MODELS,
  RealtimeTranscriber,
} from '../audio/realtime-transcription';
import { getApiKey } from '../ai/clients';
import type { AppStore } from '../store';

const DEFAULT_PROVIDER: TranscriptionProvider = 'openai';

function normalizeProvider(value: unknown): TranscriptionProvider {
  return value === 'gemini' ? 'gemini' : 'openai';
}

export function normalizeRealtimeModel(value: unknown): string {
  return typeof value === 'string' && (REALTIME_TRANSCRIBE_MODELS as readonly string[]).includes(value)
    ? value
    : DEFAULT_REALTIME_TRANSCRIBE_MODEL;
}

export function registerVoiceIPC(deps: { store: AppStore; log: any }) {
  const { store, log } = deps;

  // ------------------------------------------------------------------
  // Realtime (streaming) transcription — one live session at a time.
  // The renderer streams PCM16 chunks; transcript events go back on the
  // one-way 'realtime-transcript' channel of whichever window started it.
  // ------------------------------------------------------------------
  let realtime: RealtimeTranscriber | null = null;

  const stopRealtime = () => {
    if (realtime) {
      realtime.stop();
      realtime = null;
    }
  };

  ipcMain.handle(
    'realtime:start',
    (event: IpcMainInvokeEvent, args?: { language?: TranscriptionLanguage; model?: string }) => {
      try {
        stopRealtime();
        const apiKey = getApiKey('openai', store, log);
        if (!apiKey) {
          return { success: false, error: 'Realtime listening needs an OpenAI API key (Settings → Models).' };
        }
        const language = normalizeTranscriptionLanguage(args?.language || store.get('voiceLanguage'));
        const model = normalizeRealtimeModel(args?.model || store.get('interviewRealtimeModel'));
        const sender = event.sender;

        realtime = new RealtimeTranscriber({
          apiKey,
          model,
          language,
          log,
          onEvent: (evt) => {
            if (!sender.isDestroyed()) sender.send('realtime-transcript', evt);
            if (evt.type === 'closed') realtime = null;
          },
        });
        realtime.start();
        return { success: true, data: { model, language } };
      } catch (error: any) {
        log.error('realtime:start error:', error);
        stopRealtime();
        return { success: false, error: error.message || 'Failed to start realtime transcription' };
      }
    }
  );

  ipcMain.on('realtime:audio', (_event: IpcMainEvent, chunk: ArrayBuffer | Uint8Array) => {
    if (!realtime || !chunk) return;
    try {
      realtime.sendAudio(Buffer.from(chunk as ArrayBuffer));
    } catch (error) {
      log.error('realtime:audio error:', error);
    }
  });

  ipcMain.handle('realtime:stop', () => {
    stopRealtime();
    return { success: true };
  });

  ipcMain.handle(
    'transcribe-audio',
    async (
      _event: IpcMainInvokeEvent,
      args: {
        audio: ArrayBuffer | Uint8Array;
        mimeType: string;
        provider?: TranscriptionProvider;
        language?: TranscriptionLanguage;
      }
    ) => {
      try {
        if (!args || !args.audio) {
          return { success: false, error: 'No audio provided' };
        }

        const buffer = Buffer.from(args.audio as ArrayBuffer);
        if (buffer.length === 0) {
          return { success: false, error: 'Empty audio buffer' };
        }

        const provider = normalizeProvider(args.provider || store.get('voiceTranscriptionProvider') || DEFAULT_PROVIDER);
        const language = normalizeTranscriptionLanguage(args.language || store.get('voiceLanguage'));
        return await transcribeAudio(buffer, args.mimeType || 'audio/webm', provider, store, log, language);
      } catch (error: any) {
        log.error('transcribe-audio handler error:', error);
        return { success: false, error: error.message || 'Transcription failed' };
      }
    }
  );

  ipcMain.handle('getVoiceProvider', () => {
    return normalizeProvider(store.get('voiceTranscriptionProvider') || DEFAULT_PROVIDER);
  });

  ipcMain.handle('saveVoiceProvider', (_event: IpcMainInvokeEvent, provider: TranscriptionProvider) => {
    try {
      store.set('voiceTranscriptionProvider', normalizeProvider(provider));
      return { success: true };
    } catch (error: any) {
      log.error('saveVoiceProvider error:', error);
      return { success: false, error: error.message || 'Save failed' };
    }
  });

  ipcMain.handle('getVoiceLanguage', () => normalizeTranscriptionLanguage(store.get('voiceLanguage')));

  ipcMain.handle('saveVoiceLanguage', (_event: IpcMainInvokeEvent, language: TranscriptionLanguage) => {
    try {
      store.set('voiceLanguage', normalizeTranscriptionLanguage(language));
      return { success: true };
    } catch (error: any) {
      log.error('saveVoiceLanguage error:', error);
      return { success: false, error: error.message || 'Save failed' };
    }
  });

  ipcMain.handle('getVoiceScreenshotMode', () => {
    const mode = store.get('voiceScreenshotMode');
    return mode === 'region' || mode === 'none' ? mode : 'full';
  });

  ipcMain.handle('saveVoiceScreenshotMode', (_event: IpcMainInvokeEvent, mode: 'full' | 'region' | 'none') => {
    try {
      const normalized = mode === 'region' || mode === 'none' ? mode : 'full';
      store.set('voiceScreenshotMode', normalized);
      return { success: true };
    } catch (error: any) {
      log.error('saveVoiceScreenshotMode error:', error);
      return { success: false, error: error.message || 'Save failed' };
    }
  });
}
