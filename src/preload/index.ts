// path: src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from './types';

const api: ElectronAPI = {
  sendPrompt: (prompt) => ipcRenderer.invoke('chatgpt-request', prompt),
  sendPromptToOpenAI: (prompt) => ipcRenderer.invoke('sendPromptToOpenAI', prompt),
  sendPromptToGemini: (prompt) => ipcRenderer.invoke('sendPromptToGemini', prompt),
  sendPromptToLMStudio: (prompt) => ipcRenderer.invoke('sendPromptToLMStudio', prompt),
  sendPromptWithScreenshotsToOpenAI: (prompt) => ipcRenderer.invoke('sendPromptWithScreenshotsToOpenAI', prompt),
  sendPromptWithScreenshotsToGemini: (prompt) => ipcRenderer.invoke('sendPromptWithScreenshotsToGemini', prompt),
  sendConversationToOpenAI: (messages) => ipcRenderer.invoke('sendConversationToOpenAI', messages),
  sendConversationToGemini: (messages) => ipcRenderer.invoke('sendConversationToGemini', messages),
  sendConversationToLMStudio: (messages) => ipcRenderer.invoke('sendConversationToLMStudio', messages),

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
  importDocumentWithKeyInfo: (filePath) => ipcRenderer.invoke('import-document-with-keyinfo', { filePath }),
  clearActiveDocContext: () => ipcRenderer.invoke('clearActiveDocContext'),
  getActiveDocInfo: () => ipcRenderer.invoke('getActiveDocInfo'),
  listDocs: () => ipcRenderer.invoke('docs:list'),
  setActiveDoc: (filePath) => ipcRenderer.invoke('docs:setActive', filePath),
  removeDoc: (filePath) => ipcRenderer.invoke('docs:remove', filePath),
  getDocKeyInfo: (filePath) => ipcRenderer.invoke('docs:getKeyInfo', filePath),
  saveDocKeyInfo: (filePath, keyInfo) => ipcRenderer.invoke('docs:saveKeyInfo', filePath, keyInfo),

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

  saveCustomSystemPrompt: (prompt) => ipcRenderer.invoke('saveCustomSystemPrompt', prompt),
  getCustomSystemPrompt: () => ipcRenderer.invoke('getCustomSystemPrompt'),

  // Legacy user template methods (kept for backwards compatibility)
  getUserPromptTemplates: () => ipcRenderer.invoke('getUserPromptTemplates'),
  saveUserPromptTemplate: (template) => ipcRenderer.invoke('saveUserPromptTemplate', template),
  deleteUserPromptTemplate: (templateId) => ipcRenderer.invoke('deleteUserPromptTemplate', templateId),

  // Unified template methods (all templates editable)
  getPromptTemplates: () => ipcRenderer.invoke('getPromptTemplates'),
  savePromptTemplate: (template) => ipcRenderer.invoke('savePromptTemplate', template),
  deletePromptTemplate: (templateId) => ipcRenderer.invoke('deletePromptTemplate', templateId),
  resetPromptTemplates: () => ipcRenderer.invoke('resetPromptTemplates'),

  // OCR Settings
  getOCRSettings: () => ipcRenderer.invoke('getOCRSettings'),
  saveOCRSettings: (settings) => ipcRenderer.invoke('saveOCRSettings', settings),
  testOCR: () => ipcRenderer.invoke('testOCR'),

  // LM Studio Settings
  getLMStudioSettings: () => ipcRenderer.invoke('getLMStudioSettings'),
  saveLMStudioSettings: (settings) => ipcRenderer.invoke('saveLMStudioSettings', settings),
  testLMStudioConnection: () => ipcRenderer.invoke('testLMStudioConnection'),

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
  onWindowShown: (callback) => { ipcRenderer.on('window-shown', () => callback()); return () => ipcRenderer.removeAllListeners('window-shown'); },
  onDocumentsUpdated: (callback) => { ipcRenderer.on('documents-updated', () => callback()); return () => ipcRenderer.removeAllListeners('documents-updated'); },
};
contextBridge.exposeInMainWorld('electronAPI', api);
