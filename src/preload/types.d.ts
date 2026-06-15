// path: src/preload/types.d.ts
export interface ElectronAPI {
  sendPrompt: (prompt: string) => Promise<string>;
  sendPromptToOpenAI: (prompt: string) => Promise<string>;
  sendPromptToGemini: (prompt: string) => Promise<string>;
  sendPromptToLMStudio: (prompt: string) => Promise<string>;
  sendPromptToZAI: (prompt: string) => Promise<string>;
  sendPromptWithScreenshotsToOpenAI: (prompt: string) => Promise<string>;
  sendPromptWithScreenshotsToGemini: (prompt: string) => Promise<string>;
  sendConversationToOpenAI: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<string>;
  sendConversationToGemini: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<string>;
  sendConversationToLMStudio: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<string>;
  sendConversationToZAI: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<string>;

  closeWindow: () => void;
  hideWindow: () => void;
  showWindow: () => void;
  moveWindow: (direction: 'up' | 'down' | 'left' | 'right') => void;

  takeScreenshot: () => Promise<{ success: boolean; path?: string; error?: string } >;
  takeRegionScreenshot: () => Promise<any>;
  captureRegion: (region: { x: number; y: number; width: number; height: number }) => void;
  cancelRegionScreenshot: () => void;
  analyzeScreenshots: (options: { language?: string }) => Promise<any>;
  analyzeScreenshotsWithOpenAI: (options: { language?: string }) => Promise<any>;
  analyzeScreenshotsWithGemini: (options: { language?: string }) => Promise<any>;
  analyzeScreenshotsWithZAI: (options: { language?: string }) => Promise<any>;
  sendPromptWithScreenshotsToZAI: (prompt: string) => Promise<string>;
  extractTextFromScreenshots: () => Promise<any>;
  importClipboardImage: () => Promise<{ success: boolean; path?: string; error?: string }>;

  // File Q&A and document context
  openFileDialog: () => Promise<{ canceled: boolean; filePath?: string }>;
  askAboutFileWithOpenAI: (filePath: string, question: string) => Promise<{ success: boolean; answer?: string; error?: string }>;
  importDocumentWithKeyInfo: (filePath: string) => Promise<{ success: boolean; fileName?: string; contentLength?: number; keyInfoLength?: number; hasKeyInfo?: boolean; error?: string }>;
  clearActiveDocContext: () => Promise<{ success: boolean }>;
  getActiveDocInfo: () => Promise<{ hasContext: boolean; fileName?: string; length?: number; hasKeyInfo?: boolean }>;
  listDocs: () => Promise<{ success: boolean; docs: Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean; hasKeyInfo?: boolean; keyInfoLength?: number }> }>;
  setActiveDoc: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  removeDoc: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  renameDoc: (filePath: string, newName: string) => Promise<{ success: boolean; fileName?: string; error?: string }>;
  getDocKeyInfo: (filePath: string) => Promise<{ success: boolean; fileName?: string; keyInfo?: string; hasKeyInfo?: boolean; contentLength?: number; keyInfoLength?: number; error?: string }>;
  saveDocKeyInfo: (filePath: string, keyInfo: string) => Promise<{ success: boolean; keyInfoLength?: number; error?: string }>;

  // User Notes
  listNotes: () => Promise<{ success: boolean; notes: Array<{ id: string; title: string; contentPreview: string; length: number; createdAt: number; updatedAt: number; active: boolean }> }>;
  getNote: (noteId: string) => Promise<{ success: boolean; note?: { id: string; title: string; content: string; createdAt: number; updatedAt: number }; error?: string }>;
  createNote: (title: string, content: string) => Promise<{ success: boolean; note?: { id: string; title: string; content: string; createdAt: number; updatedAt: number }; error?: string }>;
  updateNote: (noteId: string, updates: { title?: string; content?: string }) => Promise<{ success: boolean; note?: { id: string; title: string; content: string; createdAt: number; updatedAt: number }; error?: string }>;
  deleteNote: (noteId: string) => Promise<{ success: boolean; error?: string }>;
  setActiveNote: (noteId: string | null) => Promise<{ success: boolean; error?: string }>;
  getActiveNoteInfo: () => Promise<{ hasActiveNote: boolean; id?: string; title?: string; length?: number }>;

  saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getApiKey: () => Promise<string>;
  saveGeminiApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getGeminiApiKey: () => Promise<string>;
  saveOpenAIApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getOpenAIApiKey: () => Promise<string>;
  saveZAIApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getZAIApiKey: () => Promise<string>;
  savePreferences: (preferences: { preferredLanguage: string; answerStyle?: 'code' | 'explanation' | 'multiple-choice' }) => Promise<{ success: boolean; error?: string }>;
  getPreferences: () => Promise<{ preferredLanguage: string; answerStyle: string }>;
  saveDefaultModel: (defaultModel: 'openai' | 'gemini' | 'both' | 'lmstudio' | 'zai') => Promise<{ success: boolean; error?: string }>;
  getDefaultModel: () => Promise<'openai' | 'gemini' | 'both' | 'lmstudio' | 'zai'>;

  saveOpenAIModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  getOpenAIModel: () => Promise<string>;
  saveGeminiModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  getGeminiModel: () => Promise<string>;

  saveCustomSystemPrompt: (prompt: string) => Promise<{ success: boolean; error?: string }>;
  getCustomSystemPrompt: () => Promise<string>;

  // Legacy user template methods (kept for backwards compatibility)
  getUserPromptTemplates: () => Promise<Array<{ id: string; name: string; prompt: string }>>;
  saveUserPromptTemplate: (template: { id: string; name: string; prompt: string }) => Promise<{ success: boolean; error?: string }>;
  deleteUserPromptTemplate: (templateId: string) => Promise<{ success: boolean; error?: string }>;

  // Unified template methods (all templates editable)
  getPromptTemplates: () => Promise<Array<{ id: string; name: string; prompt: string }>>;
  savePromptTemplate: (template: { id: string; name: string; prompt: string }) => Promise<{ success: boolean; error?: string }>;
  deletePromptTemplate: (templateId: string) => Promise<{ success: boolean; error?: string }>;
  resetPromptTemplates: () => Promise<{ success: boolean; error?: string }>;

  // OCR Settings
  getOCRSettings: () => Promise<{ enabled: boolean; language: string }>;
  saveOCRSettings: (settings: { enabled: boolean; language: string }) => Promise<{ success: boolean; error?: string }>;
  testOCR: () => Promise<{ success: boolean; text?: string; confidence?: number; error?: string }>;

  // LM Studio Settings
  getLMStudioSettings: () => Promise<{ enabled: boolean; endpoint: string; model: string }>;
  saveLMStudioSettings: (settings: { enabled: boolean; endpoint: string; model: string }) => Promise<{ success: boolean; error?: string }>;
  testLMStudioConnection: () => Promise<{ success: boolean; model?: string; error?: string }>;

  // Z.AI Settings
  getZAISettings: () => Promise<{ enabled: boolean; model: string }>;
  saveZAISettings: (settings: { enabled: boolean; model: string }) => Promise<{ success: boolean; error?: string }>;
  testZAIConnection: () => Promise<{ success: boolean; model?: string; error?: string }>;

  // OpenAI & Gemini Test
  testOpenAIConnection: () => Promise<{ success: boolean; model?: string; error?: string }>;
  testGeminiConnection: () => Promise<{ success: boolean; model?: string; error?: string }>;

  copyLatestResponse: () => Promise<{ success: boolean; error?: string }>;
  processClipboardPrompt: () => Promise<{ success: boolean; prompt?: string; openaiResponse?: string; geminiResponse?: string; lmstudioResponse?: string; zaiResponse?: string; error?: string }>;

  // Voice transcription
  transcribeAudio: (audio: ArrayBuffer, mimeType: string, provider: 'openai' | 'gemini') => Promise<{ success: boolean; text?: string; error?: string }>;
  getVoiceProvider: () => Promise<'openai' | 'gemini'>;
  saveVoiceProvider: (provider: 'openai' | 'gemini') => Promise<{ success: boolean; error?: string }>;
  getVoiceScreenshotMode: () => Promise<'full' | 'region' | 'none'>;
  saveVoiceScreenshotMode: (mode: 'full' | 'region' | 'none') => Promise<{ success: boolean; error?: string }>;
  getAutoInteractionOnShow: () => Promise<boolean>;
  saveAutoInteractionOnShow: (enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  getNoteViewMode: () => Promise<'editor-only' | 'alongside'>;
  saveNoteViewMode: (mode: 'editor-only' | 'alongside') => Promise<{ success: boolean; error?: string }>;

  getScreenshots: () => Promise<string[]>;
  removeScreenshot: (index: number) => Promise<{ success: boolean; error?: string }>;

  onScreenshotTaken: (callback: (data: any) => void) => () => void;
  onProcessScreenshots: (callback: () => void) => () => void;
  onModelChanged: (callback: (model: 'openai' | 'gemini' | 'both' | 'lmstudio' | 'zai') => void) => () => void;
  onOpenAIModelChanged: (callback: (model: string) => void) => () => void;
  onExtractTextFromScreenshots: (callback: () => void) => () => void;
  onScreenshotsCleared: (callback: () => void) => () => void;
  onResponseCopied: (callback: () => void) => () => void;
  onProcessClipboardPrompt: (callback: () => void) => () => void;
  onTriggerRegionScreenshot: (callback: () => void) => () => void;
  onOverlayUpdate: (callback: (text: string) => void) => () => void;
  onToast: (callback: (msg: string) => void) => () => void;
  onWindowShown: (callback: () => void) => () => void;
  onDocumentsUpdated: (callback: () => void) => () => void;
  onNotesUpdated: (callback: () => void) => () => void;
  onToggleVoiceRecording: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    hljs: any;
    marked: any;
  }
}
