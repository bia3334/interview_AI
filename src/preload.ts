import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Send prompt to AI models
  sendPrompt: (prompt: string) => ipcRenderer.invoke('chatgpt-request', prompt),
  sendPromptToOpenAI: (prompt: string) => ipcRenderer.invoke('sendPromptToOpenAI', prompt),
  sendPromptToGemini: (prompt: string) => ipcRenderer.invoke('sendPromptToGemini', prompt),

  // Window management
  closeWindow: () => ipcRenderer.send('close-window'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  showWindow: () => ipcRenderer.send('show-window'),
  moveWindow: (direction: 'up' | 'down' | 'left' | 'right') =>
    ipcRenderer.send('move-window', direction),

  // Screenshot functionality
  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  analyzeScreenshots: (options: { language?: string }) =>
    ipcRenderer.invoke('analyze-screenshots', options),
  analyzeScreenshotsWithOpenAI: (options: { language?: string }) =>
    ipcRenderer.invoke('analyzeScreenshotsWithOpenAI', options),
  analyzeScreenshotsWithGemini: (options: { language?: string }) =>
    ipcRenderer.invoke('analyzeScreenshotsWithGemini', options),

  // API Key and Preferences management
  saveApiKey: (apiKey: string) => ipcRenderer.invoke('save-api-key', apiKey),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  saveGeminiApiKey: (apiKey: string) => ipcRenderer.invoke('saveGeminiApiKey', apiKey),
  getGeminiApiKey: () => ipcRenderer.invoke('getGeminiApiKey'),
  saveOpenAIApiKey: (apiKey: string) => ipcRenderer.invoke('saveOpenAIApiKey', apiKey),
  getOpenAIApiKey: () => ipcRenderer.invoke('getOpenAIApiKey'),
  savePreferences: (preferences: { preferredLanguage: string }) =>
    ipcRenderer.invoke('save-preferences', preferences),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  saveDefaultModel: (defaultModel: 'openai' | 'gemini' | 'both') => 
    ipcRenderer.invoke('saveDefaultModel', defaultModel),
  getDefaultModel: () => ipcRenderer.invoke('getDefaultModel'),
  
  // Clipboard functionality
  copyLatestResponse: () => ipcRenderer.invoke('copy-latest-response'),

  // Screenshot management
  getScreenshots: () => ipcRenderer.invoke('get-screenshots'),
  removeScreenshot: (index: number) => ipcRenderer.invoke('remove-screenshot', index),

  // Event listeners
  onScreenshotTaken: (callback: (data: any) => void) => {
    ipcRenderer.on('screenshot-taken', (_event, data) => callback(data));

    // Return a function to remove the listener
    return () => {
      ipcRenderer.removeAllListeners('screenshot-taken');
    };
  },

  // Event listeners for various actions
  onProcessScreenshots: (callback: () => void) => {
    ipcRenderer.on('process-screenshots', () => callback());

    // Return a function to remove the listener
    return () => {
      ipcRenderer.removeAllListeners('process-screenshots');
    };
  },

  // Event listeners for API key changes
  onAnswerStyleChanged: (callback: (style: string) => void) => {
    ipcRenderer.on('answer-style-changed', (_event, style) => callback(style));
    return () => {
      ipcRenderer.removeAllListeners('answer-style-changed');
    };
  },
  
  // Event listener for model changes
  onModelChanged: (callback: (model: 'openai' | 'gemini' | 'both') => void) => {
    ipcRenderer.on('model-changed', (_event, model) => callback(model));
    return () => {
      ipcRenderer.removeAllListeners('model-changed');
    };
  },

  // Event listeners for preferences changes
  onScreenshotsCleared: (callback: () => void) => {
    ipcRenderer.on('screenshots-cleared', () => callback());

    // Return a function to remove the listener
    return () => {
      ipcRenderer.removeAllListeners('screenshots-cleared');
    };
  },

  // Event listeners for window management
  onSwitchTab: (callback: (direction: string) => void) => {
    ipcRenderer.on('switch-tab', (_event, direction) => callback(direction));
    return () => {
      ipcRenderer.removeAllListeners('switch-tab');
    };
  },
  
  // Event listener for clipboard operations
  onResponseCopied: (callback: () => void) => {
    ipcRenderer.on('response-copied-to-clipboard', () => callback());
    return () => {
      ipcRenderer.removeAllListeners('response-copied-to-clipboard');
    };
  }
});
