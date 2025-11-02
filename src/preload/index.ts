// path: src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from './types';

const api: ElectronAPI = {
  sendPrompt: (prompt) => ipcRenderer.invoke('chatgpt-request', prompt),
  sendPromptToOpenAI: (prompt) => ipcRenderer.invoke('sendPromptToOpenAI', prompt),
  sendPromptToGemini: (prompt) => ipcRenderer.invoke('sendPromptToGemini', prompt),

  closeWindow: () => ipcRenderer.send('close-window'),
  hideWindow: () => ipcRenderer.send('hide-window'),
  showWindow: () => ipcRenderer.send('show-window'),
  moveWindow: (direction) => ipcRenderer.send('move-window', direction),

  takeScreenshot: () => ipcRenderer.invoke('take-screenshot'),
  takeRegionScreenshot: () => ipcRenderer.invoke('take-region-screenshot'),
  captureRegion: (region) => ipcRenderer.send('capture-region', region),
  cancelRegionScreenshot: () => ipcRenderer.send('cancel-region-screenshot'),
  analyzeScreenshots: (options) => ipcRenderer.invoke('analyze-screenshots', options),
  analyzeScreenshotsWithOpenAI: (options) => ipcRenderer.invoke('analyzeScreenshotsWithOpenAI', options),
  analyzeScreenshotsWithGemini: (options) => ipcRenderer.invoke('analyzeScreenshotsWithGemini', options),
  extractTextFromScreenshots: () => ipcRenderer.invoke('extractTextFromScreenshots'),
  importClipboardImage: () => ipcRenderer.invoke('import-clipboard-image'),

  // File Q&A and document context
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  askAboutFileWithOpenAI: (filePath, question) => ipcRenderer.invoke('ask-about-file-with-openai', { filePath, question }),
  clearActiveDocContext: () => ipcRenderer.invoke('clearActiveDocContext'),
  getActiveDocInfo: () => ipcRenderer.invoke('getActiveDocInfo'),
  listDocs: () => ipcRenderer.invoke('docs:list'),
  setActiveDoc: (filePath) => ipcRenderer.invoke('docs:setActive', filePath),
  removeDoc: (filePath) => ipcRenderer.invoke('docs:remove', filePath),

  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  saveGeminiApiKey: (apiKey) => ipcRenderer.invoke('saveGeminiApiKey', apiKey),
  getGeminiApiKey: () => ipcRenderer.invoke('getGeminiApiKey'),
  saveOpenAIApiKey: (apiKey) => ipcRenderer.invoke('saveOpenAIApiKey', apiKey),
  getOpenAIApiKey: () => ipcRenderer.invoke('getOpenAIApiKey'),
  savePreferences: (preferences) => ipcRenderer.invoke('save-preferences', preferences),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  saveDefaultModel: (defaultModel) => ipcRenderer.invoke('saveDefaultModel', defaultModel),
  getDefaultModel: () => ipcRenderer.invoke('getDefaultModel'),

  saveOpenAIModel: (model) => ipcRenderer.invoke('saveOpenAIModel', model),
  getOpenAIModel: () => ipcRenderer.invoke('getOpenAIModel'),

  copyLatestResponse: () => ipcRenderer.invoke('copy-latest-response'),
  processClipboardPrompt: () => ipcRenderer.invoke('processClipboardPrompt'),

  getScreenshots: () => ipcRenderer.invoke('get-screenshots'),
  removeScreenshot: (index) => ipcRenderer.invoke('remove-screenshot', index),

  onScreenshotTaken: (callback) => { ipcRenderer.on('screenshot-taken', (_e, d) => callback(d)); return () => ipcRenderer.removeAllListeners('screenshot-taken'); },
  onProcessScreenshots: (callback) => { ipcRenderer.on('process-screenshots', () => callback()); return () => ipcRenderer.removeAllListeners('process-screenshots'); },
  onAnswerStyleChanged: (callback) => { ipcRenderer.on('answer-style-changed', (_e, s) => callback(s)); return () => ipcRenderer.removeAllListeners('answer-style-changed'); },
  onModelChanged: (callback) => { ipcRenderer.on('model-changed', (_e, m) => callback(m)); return () => ipcRenderer.removeAllListeners('model-changed'); },
  onOpenAIModelChanged: (callback) => { ipcRenderer.on('openai-model-changed', (_e, m) => callback(m)); return () => ipcRenderer.removeAllListeners('openai-model-changed'); },
  onExtractTextFromScreenshots: (callback) => { ipcRenderer.on('extract-text-from-screenshots', () => callback()); return () => ipcRenderer.removeAllListeners('extract-text-from-screenshots'); },
  onScreenshotsCleared: (callback) => { ipcRenderer.on('screenshots-cleared', () => callback()); return () => ipcRenderer.removeAllListeners('screenshots-cleared'); },
  onSwitchTab: (callback) => { ipcRenderer.on('switch-tab', (_e, d) => callback(d)); return () => ipcRenderer.removeAllListeners('switch-tab'); },
  onResponseCopied: (callback) => { ipcRenderer.on('response-copied-to-clipboard', () => callback()); return () => ipcRenderer.removeAllListeners('response-copied-to-clipboard'); },
  onProcessClipboardPrompt: (callback) => { ipcRenderer.on('process-clipboard-prompt', () => callback()); return () => ipcRenderer.removeAllListeners('process-clipboard-prompt'); },
  onTriggerRegionScreenshot: (callback) => { ipcRenderer.on('trigger-region-screenshot', () => callback()); return () => ipcRenderer.removeAllListeners('trigger-region-screenshot'); },
  onOverlayUpdate: (callback) => { ipcRenderer.on('overlay-update', (_e, t) => callback(t)); return () => ipcRenderer.removeAllListeners('overlay-update'); },
  onToast: (callback) => { ipcRenderer.on('toast', (_e, m: string) => callback(m)); return () => ipcRenderer.removeAllListeners('toast'); },
};

contextBridge.exposeInMainWorld('electronAPI', api);
