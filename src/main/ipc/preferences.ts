// path: src/main/ipc/preferences.ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { DEFAULT_PROMPT_TEMPLATES } from '../constants/prompts';
import { OCR_CONFIG, OCRLanguage } from '../constants/ocr';
import { LMSTUDIO_CONFIG } from '../constants/ai';

export interface OCRSettings {
  enabled: boolean;
  language: OCRLanguage;
}

export interface LMStudioSettings {
  enabled: boolean;
  endpoint: string;
  model: string;
}

export function registerPreferencesIPC(
  ipcMain: IpcMain,
  deps: {
    store: { get: (k: string, d?: any) => any; set: (k: string, v: any) => void };
    log: { info: (...args: any[]) => void; error: (...args: any[]) => void };
    getApiKey: (type: 'openai' | 'gemini') => string;
    mainWindow: () => Electron.BrowserWindow | null;
  }
) {
  const { store, log, getApiKey, mainWindow } = deps;

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

  ipcMain.handle('saveDefaultModel', (_event: IpcMainInvokeEvent, defaultModel: 'openai' | 'gemini' | 'both' | 'lmstudio') => {
    try {
      store.set('defaultModel', defaultModel);
      // Notify renderer of model change
      const win = mainWindow();
      if (win) {
        win.webContents.send('model-changed', defaultModel);
      }
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

  // Custom System Prompt
  ipcMain.handle('getCustomSystemPrompt', () => store.get('customSystemPrompt') || '');
  ipcMain.handle('saveCustomSystemPrompt', (_event: IpcMainInvokeEvent, prompt: string) => {
    try {
      store.set('customSystemPrompt', prompt);
      log.info('Custom system prompt saved successfully');
      return { success: true };
    } catch (error: any) {
      log.error('Error saving custom system prompt:', error);
      return { success: false, error: error.message };
    }
  });

  // Prompt Templates (unified - all editable)
  ipcMain.handle('getPromptTemplates', () => {
    return store.get('promptTemplates') || [];
  });

  ipcMain.handle('savePromptTemplate', (_event: IpcMainInvokeEvent, template: { id: string; name: string; prompt: string }) => {
    try {
      const templates = store.get('promptTemplates') || [];
      const existingIndex = templates.findIndex((t: any) => t.id === template.id);
      
      if (existingIndex >= 0) {
        // Update existing
        templates[existingIndex] = template;
      } else {
        // Add new
        templates.push(template);
      }
      
      store.set('promptTemplates', templates);
      log.info(`Prompt template "${template.name}" saved successfully`);
      return { success: true };
    } catch (error: any) {
      log.error('Error saving prompt template:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('deletePromptTemplate', (_event: IpcMainInvokeEvent, templateId: string) => {
    try {
      const templates = store.get('promptTemplates') || [];
      const filtered = templates.filter((t: any) => t.id !== templateId);
      store.set('promptTemplates', filtered);
      log.info(`Prompt template deleted successfully`);
      return { success: true };
    } catch (error: any) {
      log.error('Error deleting prompt template:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('resetPromptTemplates', () => {
    try {
      store.set('promptTemplates', DEFAULT_PROMPT_TEMPLATES);
      log.info('Prompt templates reset to defaults');
      return { success: true };
    } catch (error: any) {
      log.error('Error resetting prompt templates:', error);
      return { success: false, error: error.message };
    }
  });

  // Legacy handlers (keep for backwards compatibility, redirect to new ones)
  ipcMain.handle('getUserPromptTemplates', () => {
    return store.get('promptTemplates') || [];
  });

  ipcMain.handle('saveUserPromptTemplate', (_event: IpcMainInvokeEvent, template: { id: string; name: string; prompt: string }) => {
    try {
      const templates = store.get('promptTemplates') || [];
      const existingIndex = templates.findIndex((t: any) => t.id === template.id);
      
      if (existingIndex >= 0) {
        templates[existingIndex] = template;
      } else {
        templates.push(template);
      }
      
      store.set('promptTemplates', templates);
      log.info(`Prompt template "${template.name}" saved successfully`);
      return { success: true };
    } catch (error: any) {
      log.error('Error saving prompt template:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('deleteUserPromptTemplate', (_event: IpcMainInvokeEvent, templateId: string) => {
    try {
      const templates = store.get('promptTemplates') || [];
      const filtered = templates.filter((t: any) => t.id !== templateId);
      store.set('promptTemplates', filtered);
      log.info(`Prompt template deleted successfully`);
      return { success: true };
    } catch (error: any) {
      log.error('Error deleting prompt template:', error);
      return { success: false, error: error.message };
    }
  });

  // OCR Settings
  ipcMain.handle('getOCRSettings', (): OCRSettings => {
    return {
      enabled: store.get('ocrEnabled', OCR_CONFIG.DEFAULT_ENABLED),
      language: store.get('ocrLanguage', OCR_CONFIG.DEFAULT_LANGUAGE),
    };
  });

  ipcMain.handle('saveOCRSettings', (_event: IpcMainInvokeEvent, settings: OCRSettings) => {
    try {
      store.set('ocrEnabled', settings.enabled);
      store.set('ocrLanguage', settings.language);
      log.info('OCR settings saved:', settings);
      return { success: true };
    } catch (error: any) {
      log.error('Error saving OCR settings:', error);
      return { success: false, error: error.message };
    }
  });

  // LM Studio Settings
  ipcMain.handle('getLMStudioSettings', (): LMStudioSettings => {
    return {
      enabled: store.get('lmstudioEnabled', false),
      endpoint: store.get('lmstudioEndpoint', LMSTUDIO_CONFIG.DEFAULT_ENDPOINT),
      model: store.get('lmstudioModel', LMSTUDIO_CONFIG.DEFAULT_MODEL),
    };
  });

  ipcMain.handle('saveLMStudioSettings', (_event: IpcMainInvokeEvent, settings: LMStudioSettings) => {
    try {
      store.set('lmstudioEnabled', settings.enabled);
      store.set('lmstudioEndpoint', settings.endpoint);
      store.set('lmstudioModel', settings.model);
      log.info('LM Studio settings saved:', settings);
      return { success: true };
    } catch (error: any) {
      log.error('Error saving LM Studio settings:', error);
      return { success: false, error: error.message };
    }
  });
}
