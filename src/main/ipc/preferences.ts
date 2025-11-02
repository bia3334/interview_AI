// path: src/main/ipc/preferences.ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

export function registerPreferencesIPC(
  ipcMain: IpcMain,
  deps: {
    store: { get: (k: string, d?: any) => any; set: (k: string, v: any) => void };
    log: { info: (...args: any[]) => void; error: (...args: any[]) => void };
    getApiKey: (type: 'openai' | 'gemini') => string;
  }
) {
  const { store, log, getApiKey } = deps;

  ipcMain.handle('save-api-key', (_event: IpcMainInvokeEvent, apiKey: string) => {
    try {
      store.set('apiKey', apiKey);
      store.set('openaiApiKey', apiKey);
      return { success: true };
    } catch (error: any) {
      log.error('Error saving API key:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('saveGeminiApiKey', (_event: IpcMainInvokeEvent, apiKey: string) => {
    try {
      store.set('geminiApiKey', apiKey);
      log.info('Gemini API key saved successfully');
      return { success: true };
    } catch (error: any) {
      log.error('Error saving Gemini API key:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('saveOpenAIApiKey', (_event: IpcMainInvokeEvent, apiKey: string) => {
    try {
      store.set('openaiApiKey', apiKey);
      store.set('apiKey', apiKey);
      log.info('OpenAI API key saved successfully');
      return { success: true };
    } catch (error: any) {
      log.error('Error saving OpenAI API key:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('getGeminiApiKey', () => getApiKey('gemini'));
  ipcMain.handle('getOpenAIApiKey', () => getApiKey('openai'));
  ipcMain.handle('get-api-key', () => getApiKey('openai') || getApiKey('gemini'));

  ipcMain.handle(
    'save-preferences',
    (_event: IpcMainInvokeEvent, preferences: { preferredLanguage: string; answerStyle?: 'code' | 'explanation' | 'multiple-choice' }) => {
      try {
        if (preferences.preferredLanguage) {
          store.set('preferredLanguage', preferences.preferredLanguage);
        }
        if (preferences.answerStyle) {
          store.set('answerStyle', preferences.answerStyle);
        }
        return { success: true };
      } catch (error: any) {
        log.error('Error saving preferences:', error);
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle('get-preferences', () => ({
    preferredLanguage: store.get('preferredLanguage') || 'python',
    answerStyle: store.get('answerStyle') || 'explanation',
  }));

  ipcMain.handle('saveDefaultModel', (_event: IpcMainInvokeEvent, defaultModel: 'openai' | 'gemini' | 'both') => {
    try {
      store.set('defaultModel', defaultModel);
      return { success: true };
    } catch (error: any) {
      log.error('Error saving default model preference:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('getDefaultModel', () => store.get('defaultModel') || 'both');

  ipcMain.handle('getOpenAIModel', () => store.get('openaiModel'));
  ipcMain.handle('saveOpenAIModel', (_event: IpcMainInvokeEvent, model: string) => {
    try {
      store.set('openaiModel', model);
      return { success: true };
    } catch (error: any) {
      log.error('Error saving OpenAI model preference:', error);
      return { success: false, error: error.message };
    }
  });
}
