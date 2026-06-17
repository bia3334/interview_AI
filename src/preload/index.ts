// path: src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';
import type { ElectronAPI } from './types';

const api: ElectronAPI = {
  sendPrompt: (prompt) => ipcRenderer.invoke('chatgpt-request', prompt),
  sendPromptToOpenAI: (prompt, requestId) => ipcRenderer.invoke('sendPromptToOpenAI', prompt, requestId),
  sendPromptToGemini: (prompt, requestId) => ipcRenderer.invoke('sendPromptToGemini', prompt, requestId),
  sendPromptToLMStudio: (prompt, requestId) => ipcRenderer.invoke('sendPromptToLMStudio', prompt, requestId),
  sendPromptToZAI: (prompt, requestId) => ipcRenderer.invoke('sendPromptToZAI', prompt, requestId),
  sendPromptToClaude: (prompt, requestId) => ipcRenderer.invoke('sendPromptToClaude', prompt, requestId),
  sendPromptWithScreenshotsToOpenAI: (prompt, requestId) => ipcRenderer.invoke('sendPromptWithScreenshotsToOpenAI', prompt, requestId),
  sendPromptWithScreenshotsToGemini: (prompt, requestId) => ipcRenderer.invoke('sendPromptWithScreenshotsToGemini', prompt, requestId),
  sendPromptWithScreenshotsToClaude: (prompt, requestId) => ipcRenderer.invoke('sendPromptWithScreenshotsToClaude', prompt, requestId),
  sendConversationToOpenAI: (messages, requestId) => ipcRenderer.invoke('sendConversationToOpenAI', messages, requestId),
  sendConversationToGemini: (messages, requestId) => ipcRenderer.invoke('sendConversationToGemini', messages, requestId),
  sendConversationToLMStudio: (messages, requestId) => ipcRenderer.invoke('sendConversationToLMStudio', messages, requestId),
  sendConversationToZAI: (messages, requestId) => ipcRenderer.invoke('sendConversationToZAI', messages, requestId),
  sendConversationToClaude: (messages, requestId) => ipcRenderer.invoke('sendConversationToClaude', messages, requestId),

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
  analyzeScreenshotsWithZAI: (options) => ipcRenderer.invoke('analyzeScreenshotsWithZAI', options),
  analyzeScreenshotsWithClaude: (options) => ipcRenderer.invoke('analyzeScreenshotsWithClaude', options),
  sendPromptWithScreenshotsToZAI: (prompt, requestId) => ipcRenderer.invoke('sendPromptWithScreenshotsToZAI', prompt, requestId),
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
  renameDoc: (filePath, newName) => ipcRenderer.invoke('docs:rename', filePath, newName),
  getDocKeyInfo: (filePath) => ipcRenderer.invoke('docs:getKeyInfo', filePath),
  saveDocKeyInfo: (filePath, keyInfo) => ipcRenderer.invoke('docs:saveKeyInfo', filePath, keyInfo),

  // User Notes
  listNotes: () => ipcRenderer.invoke('notes:list'),
  getNote: (noteId) => ipcRenderer.invoke('notes:get', noteId),
  createNote: (title, content) => ipcRenderer.invoke('notes:create', title, content),
  updateNote: (noteId, updates) => ipcRenderer.invoke('notes:update', noteId, updates),
  deleteNote: (noteId) => ipcRenderer.invoke('notes:delete', noteId),
  setActiveNote: (noteId) => ipcRenderer.invoke('notes:setActive', noteId),
  getActiveNoteInfo: () => ipcRenderer.invoke('notes:getActiveInfo'),

  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  saveGeminiApiKey: (apiKey) => ipcRenderer.invoke('saveGeminiApiKey', apiKey),
  getGeminiApiKey: () => ipcRenderer.invoke('getGeminiApiKey'),
  saveOpenAIApiKey: (apiKey) => ipcRenderer.invoke('saveOpenAIApiKey', apiKey),
  getOpenAIApiKey: () => ipcRenderer.invoke('getOpenAIApiKey'),
  saveZAIApiKey: (apiKey) => ipcRenderer.invoke('saveZAIApiKey', apiKey),
  getZAIApiKey: () => ipcRenderer.invoke('getZAIApiKey'),
  saveClaudeApiKey: (apiKey) => ipcRenderer.invoke('saveClaudeApiKey', apiKey),
  getClaudeApiKey: () => ipcRenderer.invoke('getClaudeApiKey'),
  savePreferences: (preferences) => ipcRenderer.invoke('save-preferences', preferences),
  getPreferences: () => ipcRenderer.invoke('get-preferences'),
  saveDefaultModel: (defaultModel) => ipcRenderer.invoke('saveDefaultModel', defaultModel),
  getDefaultModel: () => ipcRenderer.invoke('getDefaultModel'),

  saveOpenAIModel: (model) => ipcRenderer.invoke('saveOpenAIModel', model),
  getOpenAIModel: () => ipcRenderer.invoke('getOpenAIModel'),
  saveGeminiModel: (model) => ipcRenderer.invoke('saveGeminiModel', model),
  getGeminiModel: () => ipcRenderer.invoke('getGeminiModel'),
  saveClaudeModel: (model) => ipcRenderer.invoke('saveClaudeModel', model),
  getClaudeModel: () => ipcRenderer.invoke('getClaudeModel'),

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

  // Z.AI Settings
  getZAISettings: () => ipcRenderer.invoke('getZAISettings'),
  saveZAISettings: (settings) => ipcRenderer.invoke('saveZAISettings', settings),
  testZAIConnection: () => ipcRenderer.invoke('testZAIConnection'),

  // OpenAI & Gemini Test
  testOpenAIConnection: () => ipcRenderer.invoke('testOpenAIConnection'),
  testGeminiConnection: () => ipcRenderer.invoke('testGeminiConnection'),
  testClaudeConnection: () => ipcRenderer.invoke('testClaudeConnection'),

  copyLatestResponse: () => ipcRenderer.invoke('copy-latest-response'),
  processClipboardPrompt: () => ipcRenderer.invoke('processClipboardPrompt'),

  getAccumulatedTokenUsage: () => ipcRenderer.invoke('getAccumulatedTokenUsage'),
  resetAccumulatedTokenUsage: () => ipcRenderer.invoke('resetAccumulatedTokenUsage'),

  // Voice transcription
  transcribeAudio: (audio, mimeType, provider) => ipcRenderer.invoke('transcribe-audio', { audio, mimeType, provider }),
  getVoiceProvider: () => ipcRenderer.invoke('getVoiceProvider'),
  saveVoiceProvider: (provider) => ipcRenderer.invoke('saveVoiceProvider', provider),
  getVoiceScreenshotMode: () => ipcRenderer.invoke('getVoiceScreenshotMode'),
  saveVoiceScreenshotMode: (mode) => ipcRenderer.invoke('saveVoiceScreenshotMode', mode),
  getAutoInteractionOnShow: () => ipcRenderer.invoke('getAutoInteractionOnShow'),
  saveAutoInteractionOnShow: (enabled) => ipcRenderer.invoke('saveAutoInteractionOnShow', enabled),
  getNoteViewMode: () => ipcRenderer.invoke('getNoteViewMode'),
  saveNoteViewMode: (mode) => ipcRenderer.invoke('saveNoteViewMode', mode),

  // Global shortcuts (rebindable)
  getShortcuts: () => ipcRenderer.invoke('getShortcuts'),
  saveShortcut: (id, accelerator) => ipcRenderer.invoke('saveShortcut', id, accelerator),
  resetShortcuts: () => ipcRenderer.invoke('resetShortcuts'),
  setShortcutCapture: (active) => ipcRenderer.invoke('setShortcutCapture', active),

  getScreenshots: () => ipcRenderer.invoke('get-screenshots'),
  removeScreenshot: (index) => ipcRenderer.invoke('remove-screenshot', index),

  onScreenshotTaken: (callback) => { ipcRenderer.on('screenshot-taken', (_e, d) => callback(d)); return () => ipcRenderer.removeAllListeners('screenshot-taken'); },
  onProcessScreenshots: (callback) => { ipcRenderer.on('process-screenshots', () => callback()); return () => ipcRenderer.removeAllListeners('process-screenshots'); },
  onModelChanged: (callback) => { ipcRenderer.on('model-changed', (_e, m) => callback(m)); return () => ipcRenderer.removeAllListeners('model-changed'); },
  onOpenAIModelChanged: (callback) => { ipcRenderer.on('openai-model-changed', (_e, m) => callback(m)); return () => ipcRenderer.removeAllListeners('openai-model-changed'); },
  onExtractTextFromScreenshots: (callback) => { ipcRenderer.on('extract-text-from-screenshots', () => callback()); return () => ipcRenderer.removeAllListeners('extract-text-from-screenshots'); },
  onScreenshotsCleared: (callback) => { ipcRenderer.on('screenshots-cleared', () => callback()); return () => ipcRenderer.removeAllListeners('screenshots-cleared'); },
  onResponseCopied: (callback) => { ipcRenderer.on('response-copied-to-clipboard', () => callback()); return () => ipcRenderer.removeAllListeners('response-copied-to-clipboard'); },
  onProcessClipboardPrompt: (callback) => { ipcRenderer.on('process-clipboard-prompt', () => callback()); return () => ipcRenderer.removeAllListeners('process-clipboard-prompt'); },
  onTriggerRegionScreenshot: (callback) => { ipcRenderer.on('trigger-region-screenshot', () => callback()); return () => ipcRenderer.removeAllListeners('trigger-region-screenshot'); },
  onOverlayUpdate: (callback) => { ipcRenderer.on('overlay-update', (_e, t) => callback(t)); return () => ipcRenderer.removeAllListeners('overlay-update'); },
  onToast: (callback) => { ipcRenderer.on('toast', (_e, m: string) => callback(m)); return () => ipcRenderer.removeAllListeners('toast'); },
  onWindowShown: (callback) => { ipcRenderer.on('window-shown', () => callback()); return () => ipcRenderer.removeAllListeners('window-shown'); },
  onDocumentsUpdated: (callback) => { ipcRenderer.on('documents-updated', () => callback()); return () => ipcRenderer.removeAllListeners('documents-updated'); },
  onNotesUpdated: (callback) => { ipcRenderer.on('notes-updated', () => callback()); return () => ipcRenderer.removeAllListeners('notes-updated'); },
  onToggleVoiceRecording: (callback) => { ipcRenderer.on('toggle-voice-recording', () => callback()); return () => ipcRenderer.removeAllListeners('toggle-voice-recording'); },
  onAIStream: (callback) => { ipcRenderer.on('ai-stream', (_e, d) => callback(d)); return () => ipcRenderer.removeAllListeners('ai-stream'); },
  onTokenUsageUpdated: (callback) => { ipcRenderer.on('token-usage-updated', (_e, d) => callback(d)); return () => ipcRenderer.removeAllListeners('token-usage-updated'); },
};
contextBridge.exposeInMainWorld('electronAPI', api);
