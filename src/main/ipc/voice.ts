/**
 * Voice-input IPC handlers: transcription + provider preference.
 */
import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { transcribeAudio, TranscriptionProvider } from '../audio/transcription';
import type { AppStore } from '../store';

const DEFAULT_PROVIDER: TranscriptionProvider = 'openai';

function normalizeProvider(value: unknown): TranscriptionProvider {
  return value === 'gemini' ? 'gemini' : 'openai';
}

export function registerVoiceIPC(deps: { store: AppStore; log: any }) {
  const { store, log } = deps;

  ipcMain.handle(
    'transcribe-audio',
    async (
      _event: IpcMainInvokeEvent,
      args: { audio: ArrayBuffer | Uint8Array; mimeType: string; provider?: TranscriptionProvider }
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
        return await transcribeAudio(buffer, args.mimeType || 'audio/webm', provider, store, log);
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
}
