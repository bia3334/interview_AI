// path: src/preload/types.d.ts
export interface ElectronAPI {
  sendPrompt: (prompt: string) => Promise<string>;
  sendPromptToOpenAI: (prompt: string) => Promise<string>;
  sendPromptToGemini: (prompt: string) => Promise<string>;
  sendConversationToOpenAI: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<string>;
  sendConversationToGemini: (messages: Array<{ role: 'user' | 'assistant'; content: string }>) => Promise<string>;

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
  extractTextFromScreenshots: () => Promise<any>;
  importClipboardImage: () => Promise<{ success: boolean; path?: string; error?: string }>;

  // File Q&A and document context
  openFileDialog: () => Promise<{ canceled: boolean; filePath?: string }>;
  askAboutFileWithOpenAI: (filePath: string, question: string) => Promise<{ success: boolean; answer?: string; error?: string }>;
  clearActiveDocContext: () => Promise<{ success: boolean }>;
  getActiveDocInfo: () => Promise<{ hasContext: boolean; fileName?: string; length?: number }>;
  listDocs: () => Promise<{ success: boolean; docs: Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean }> }>;
  setActiveDoc: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  removeDoc: (filePath: string) => Promise<{ success: boolean; error?: string }>;

  saveApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getApiKey: () => Promise<string>;
  saveGeminiApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getGeminiApiKey: () => Promise<string>;
  saveOpenAIApiKey: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  getOpenAIApiKey: () => Promise<string>;
  savePreferences: (preferences: { preferredLanguage: string; answerStyle?: 'code' | 'explanation' | 'multiple-choice' }) => Promise<{ success: boolean; error?: string }>;
  getPreferences: () => Promise<{ preferredLanguage: string; answerStyle: string }>;
  saveDefaultModel: (defaultModel: 'openai' | 'gemini' | 'both') => Promise<{ success: boolean; error?: string }>;
  getDefaultModel: () => Promise<'openai' | 'gemini' | 'both'>;

  saveOpenAIModel: (model: string) => Promise<{ success: boolean; error?: string }>;
  getOpenAIModel: () => Promise<string>;

  copyLatestResponse: () => Promise<{ success: boolean; error?: string }>;
  processClipboardPrompt: () => Promise<{ success: boolean; prompt?: string; openaiResponse?: string; geminiResponse?: string; error?: string }>;

  getScreenshots: () => Promise<string[]>;
  removeScreenshot: (index: number) => Promise<{ success: boolean; error?: string }>;

  onScreenshotTaken: (callback: (data: any) => void) => () => void;
  onProcessScreenshots: (callback: () => void) => () => void;
  onAnswerStyleChanged: (callback: (style: string) => void) => () => void;
  onModelChanged: (callback: (model: 'openai' | 'gemini' | 'both') => void) => () => void;
  onOpenAIModelChanged: (callback: (model: string) => void) => () => void;
  onExtractTextFromScreenshots: (callback: () => void) => () => void;
  onScreenshotsCleared: (callback: () => void) => () => void;
  onSwitchTab: (callback: (direction: string) => void) => () => void;
  onResponseCopied: (callback: () => void) => () => void;
  onProcessClipboardPrompt: (callback: () => void) => () => void;
  onTriggerRegionScreenshot: (callback: () => void) => () => void;
  onOverlayUpdate: (callback: (text: string) => void) => () => void;
  onToast: (callback: (msg: string) => void) => () => void;
  onWindowShown: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    hljs: any;
    marked: any;
  }
}
