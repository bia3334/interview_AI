/**
 * App mode IPC: launch picker (Exam / Interview) + interview-mode settings.
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { applyAppMode, AppMode } from '../window';
import { normalizeRealtimeModel } from './voice';

export type InterviewProvider = 'auto' | 'openai' | 'gemini' | 'claude' | 'zai' | 'lmstudio';
export type AnswerLanguage = 'auto' | 'en' | 'vi';
/**
 * How interview mode listens:
 *  standard — local VAD cuts utterances, each is transcribed as a file (Whisper/Gemini)
 *  realtime — audio streams to the OpenAI Realtime API; words appear as they're spoken
 */
export type ListenMode = 'standard' | 'realtime';

export interface InterviewSettings {
  provider: InterviewProvider;
  answerLanguage: AnswerLanguage;
  autoAnswer: boolean;
  listenMode: ListenMode;
  realtimeModel: string;
}

const PROVIDERS: InterviewProvider[] = ['auto', 'openai', 'gemini', 'claude', 'zai', 'lmstudio'];
const LANGUAGES: AnswerLanguage[] = ['auto', 'en', 'vi'];
const LISTEN_MODES: ListenMode[] = ['standard', 'realtime'];

function normalizeMode(value: unknown): AppMode | null {
  return value === 'exam' || value === 'interview' ? value : null;
}

export function registerModeIPC(
  ipcMain: IpcMain,
  deps: {
    store: { get: (k: string, d?: any) => any; set: (k: string, v: any) => void };
    log: { info: (...args: any[]) => void; error: (...args: any[]) => void };
  }
) {
  const { store, log } = deps;

  /** Last chosen mode (for preselecting the picker), or null on first run. */
  ipcMain.handle('getAppMode', () => normalizeMode(store.get('appMode')));

  /**
   * Set the active mode. `null` means "back to the picker" — the window is
   * made interactive so the picker can be clicked; the remembered mode is kept.
   */
  ipcMain.handle('setAppMode', (_event: IpcMainInvokeEvent, mode: AppMode | null) => {
    try {
      const normalized = normalizeMode(mode);
      if (normalized) store.set('appMode', normalized);
      applyAppMode(normalized, store);
      log.info(`App mode: ${normalized ?? 'picker'}`);
      return { success: true, data: normalized };
    } catch (error: any) {
      log.error('setAppMode error:', error);
      return { success: false, error: error.message || 'Failed to set app mode' };
    }
  });

  ipcMain.handle('getInterviewSettings', (): InterviewSettings => {
    const provider = store.get('interviewProvider');
    const answerLanguage = store.get('interviewAnswerLanguage');
    const listenMode = store.get('interviewListenMode');
    return {
      provider: PROVIDERS.includes(provider) ? provider : 'auto',
      answerLanguage: LANGUAGES.includes(answerLanguage) ? answerLanguage : 'auto',
      autoAnswer: store.get('interviewAutoAnswer') !== false,
      listenMode: LISTEN_MODES.includes(listenMode) ? listenMode : 'standard',
      realtimeModel: normalizeRealtimeModel(store.get('interviewRealtimeModel')),
    };
  });

  ipcMain.handle('saveInterviewSettings', (_event: IpcMainInvokeEvent, settings: Partial<InterviewSettings>) => {
    try {
      if (settings.provider && PROVIDERS.includes(settings.provider)) {
        store.set('interviewProvider', settings.provider);
      }
      if (settings.answerLanguage && LANGUAGES.includes(settings.answerLanguage)) {
        store.set('interviewAnswerLanguage', settings.answerLanguage);
      }
      if (typeof settings.autoAnswer === 'boolean') {
        store.set('interviewAutoAnswer', settings.autoAnswer);
      }
      if (settings.listenMode && LISTEN_MODES.includes(settings.listenMode)) {
        store.set('interviewListenMode', settings.listenMode);
      }
      if (typeof settings.realtimeModel === 'string') {
        store.set('interviewRealtimeModel', normalizeRealtimeModel(settings.realtimeModel));
      }
      return { success: true };
    } catch (error: any) {
      log.error('saveInterviewSettings error:', error);
      return { success: false, error: error.message || 'Failed to save interview settings' };
    }
  });
}
