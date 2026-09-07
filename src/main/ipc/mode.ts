/**
 * App mode IPC: launch picker (Exam / Interview) + interview-mode settings.
 */
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { systemPreferences } from 'electron';
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

/**
 * Where the call audio comes from: 'loopback' (system output mix, Windows),
 * 'default' (OS default input device) or an input deviceId (e.g. BlackHole on
 * macOS, or a microphone when the call runs on another device).
 */
export type AudioSource = 'loopback' | 'default' | string;

export interface InterviewSettings {
  provider: InterviewProvider;
  answerLanguage: AnswerLanguage;
  autoAnswer: boolean;
  listenMode: ListenMode;
  realtimeModel: string;
  audioSource: AudioSource;
}

/** Loopback exists only on Windows; elsewhere start on the default input. */
export function defaultAudioSource(): AudioSource {
  return process.platform === 'win32' ? 'loopback' : 'default';
}

function normalizeAudioSource(value: unknown): AudioSource {
  return typeof value === 'string' && value.trim() ? value.trim() : defaultAudioSource();
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

  /**
   * Ask the OS for microphone access before an input-device capture. macOS
   * shows its privacy prompt here (and needs NSMicrophoneUsageDescription in
   * the packaged app); Windows/Linux resolve immediately.
   */
  ipcMain.handle('requestMicrophoneAccess', async () => {
    try {
      if (process.platform !== 'darwin') return { success: true, data: { granted: true } };
      const status = systemPreferences.getMediaAccessStatus('microphone');
      const granted = status === 'granted' ? true : await systemPreferences.askForMediaAccess('microphone');
      return { success: true, data: { granted } };
    } catch (error: any) {
      log.error('requestMicrophoneAccess error:', error);
      return { success: false, error: error.message || 'Microphone permission request failed' };
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
      audioSource: normalizeAudioSource(store.get('interviewAudioSource')),
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
      if (typeof settings.audioSource === 'string') {
        store.set('interviewAudioSource', normalizeAudioSource(settings.audioSource));
      }
      return { success: true };
    } catch (error: any) {
      log.error('saveInterviewSettings error:', error);
      return { success: false, error: error.message || 'Failed to save interview settings' };
    }
  });
}
