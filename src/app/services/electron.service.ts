import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ElectronAPI } from '../../preload/types';
import { STORAGE_KEYS } from '../constants/settings';

export interface HistoryItem {
  id: string;
  timestamp: Date;
  prompt: string;
  screenshotCount: number;
  openaiResponse?: string;
  geminiResponse?: string;
  lmstudioResponse?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ElectronService {
  private electronAPI: ElectronAPI;

  // Create subjects once and reuse them to avoid memory leaks
  private screenshotTaken$ = new Subject<any>();
  private processScreenshots$ = new Subject<void>();
  private screenshotsCleared$ = new Subject<void>();
  private answerStyleChanged$ = new Subject<string>();
  private modelChanged$ = new Subject<'openai' | 'gemini' | 'both' | 'lmstudio'>();
  private switchTab$ = new Subject<string>();
  private responseCopied$ = new Subject<void>();
  private processClipboardPrompt$ = new Subject<void>();
  private triggerRegionScreenshot$ = new Subject<void>();
  private extractTextFromScreenshots$ = new Subject<void>();
  private toast$ = new Subject<string>();
  private historyUpdated$ = new Subject<void>();
  private windowShown$ = new Subject<void>();
  private documentsUpdated$ = new Subject<void>();

  // Local history storage key
  private readonly HISTORY_KEY = STORAGE_KEYS.HISTORY;

  constructor() {
    console.log('ElectronService: Initializing...');
    if (typeof window !== 'undefined' && window.electronAPI) {
      console.log('ElectronService: ElectronAPI found!');
      this.electronAPI = window.electronAPI;
      this.setupEventListeners();
    } else {
      console.warn('ElectronService: ElectronAPI not available - running outside Electron context');
      // Create mock API for development/testing
      this.electronAPI = this.createMockAPI();
    }
  }

  private setupEventListeners(): void {
    // Set up IPC listeners once in constructor
    this.electronAPI.onScreenshotTaken((data) => this.screenshotTaken$.next(data));
    this.electronAPI.onProcessScreenshots(() => this.processScreenshots$.next());
    this.electronAPI.onScreenshotsCleared(() => this.screenshotsCleared$.next());
    this.electronAPI.onAnswerStyleChanged((style) => this.answerStyleChanged$.next(style));
    this.electronAPI.onModelChanged((model) => this.modelChanged$.next(model));
    this.electronAPI.onSwitchTab((direction) => this.switchTab$.next(direction));
    this.electronAPI.onResponseCopied(() => this.responseCopied$.next());
    this.electronAPI.onProcessClipboardPrompt(() => this.processClipboardPrompt$.next());
    this.electronAPI.onTriggerRegionScreenshot(() => this.triggerRegionScreenshot$.next());
    this.electronAPI.onExtractTextFromScreenshots(() => this.extractTextFromScreenshots$.next());
    this.electronAPI.onToast((msg) => this.toast$.next(msg));
    this.electronAPI.onWindowShown(() => this.windowShown$.next());
    this.electronAPI.onDocumentsUpdated(() => this.documentsUpdated$.next());
  }

  // Window controls
  closeWindow(): void {
    this.electronAPI.closeWindow();
  }

  hideWindow(): void {
    this.electronAPI.hideWindow();
  }

  showWindow(): void {
    this.electronAPI.showWindow();
  }

  moveWindow(direction: 'up' | 'down' | 'left' | 'right'): void {
    this.electronAPI.moveWindow(direction);
  }

  // AI Prompts
  sendPromptToOpenAI(prompt: string): Promise<string> {
    return this.electronAPI.sendPromptToOpenAI(prompt);
  }

  sendPromptToGemini(prompt: string): Promise<string> {
    return this.electronAPI.sendPromptToGemini(prompt);
  }

  sendPromptWithScreenshotsToOpenAI(prompt: string): Promise<string> {
    return this.electronAPI.sendPromptWithScreenshotsToOpenAI(prompt);
  }

  sendPromptWithScreenshotsToGemini(prompt: string): Promise<string> {
    return this.electronAPI.sendPromptWithScreenshotsToGemini(prompt);
  }

  sendConversationToOpenAI(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    return this.electronAPI.sendConversationToOpenAI(messages);
  }

  sendConversationToGemini(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    return this.electronAPI.sendConversationToGemini(messages);
  }

  // LM Studio
  sendPromptToLMStudio(prompt: string): Promise<string> {
    return this.electronAPI.sendPromptToLMStudio(prompt);
  }

  sendConversationToLMStudio(messages: Array<{ role: 'user' | 'assistant'; content: string }>): Promise<string> {
    return this.electronAPI.sendConversationToLMStudio(messages);
  }

  processClipboardPrompt(): Promise<{ success: boolean; prompt?: string; openaiResponse?: string; geminiResponse?: string; lmstudioResponse?: string; error?: string }> {
    return this.electronAPI.processClipboardPrompt();
  }

  // Screenshots
  takeScreenshot(): Promise<{ success: boolean; path?: string; error?: string }> {
    return this.electronAPI.takeScreenshot();
  }

  takeRegionScreenshot(): Promise<any> {
    return this.electronAPI.takeRegionScreenshot();
  }

  getScreenshots(): Promise<string[]> {
    return this.electronAPI.getScreenshots();
  }

  removeScreenshot(index: number): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.removeScreenshot(index);
  }

  analyzeScreenshotsWithOpenAI(options: { language?: string }): Promise<any> {
    return this.electronAPI.analyzeScreenshotsWithOpenAI(options);
  }

  analyzeScreenshotsWithGemini(options: { language?: string }): Promise<any> {
    return this.electronAPI.analyzeScreenshotsWithGemini(options);
  }

  extractTextFromScreenshots(): Promise<any> {
    return this.electronAPI.extractTextFromScreenshots();
  }

  // Preferences
  getPreferences(): Promise<{ preferredLanguage: string; answerStyle: string }> {
    return this.electronAPI.getPreferences();
  }

  savePreferences(preferences: { preferredLanguage: string; answerStyle?: 'code' | 'explanation' | 'multiple-choice' }): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.savePreferences(preferences);
  }

  getDefaultModel(): Promise<'openai' | 'gemini' | 'both' | 'lmstudio'> {
    return this.electronAPI.getDefaultModel();
  }

  saveDefaultModel(defaultModel: 'openai' | 'gemini' | 'both' | 'lmstudio'): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.saveDefaultModel(defaultModel);
  }

  // API Keys
  getOpenAIApiKey(): Promise<string> {
    return this.electronAPI.getOpenAIApiKey();
  }

  saveOpenAIApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.saveOpenAIApiKey(apiKey);
  }

  getGeminiApiKey(): Promise<string> {
    return this.electronAPI.getGeminiApiKey();
  }

  saveGeminiApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.saveGeminiApiKey(apiKey);
  }

  // Custom System Prompt
  getCustomSystemPrompt(): Promise<string> {
    return this.electronAPI.getCustomSystemPrompt();
  }

  saveCustomSystemPrompt(prompt: string): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.saveCustomSystemPrompt(prompt);
  }

  // User Prompt Templates (legacy methods)
  getUserPromptTemplates(): Promise<Array<{ id: string; name: string; prompt: string }>> {
    return this.electronAPI.getUserPromptTemplates();
  }

  saveUserPromptTemplate(template: { id: string; name: string; prompt: string }): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.saveUserPromptTemplate(template);
  }

  deleteUserPromptTemplate(templateId: string): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.deleteUserPromptTemplate(templateId);
  }

  // Unified Prompt Templates (all templates editable)
  getPromptTemplates(): Promise<Array<{ id: string; name: string; prompt: string }>> {
    return this.electronAPI.getPromptTemplates();
  }

  savePromptTemplate(template: { id: string; name: string; prompt: string }): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.savePromptTemplate(template);
  }

  deletePromptTemplate(templateId: string): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.deletePromptTemplate(templateId);
  }

  resetPromptTemplates(): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.resetPromptTemplates();
  }

  // OCR Settings
  getOCRSettings(): Promise<{ enabled: boolean; language: string }> {
    return this.electronAPI.getOCRSettings();
  }

  saveOCRSettings(settings: { enabled: boolean; language: string }): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.saveOCRSettings(settings);
  }

  testOCR(): Promise<{ success: boolean; text?: string; confidence?: number; error?: string }> {
    return this.electronAPI.testOCR();
  }

  // LM Studio Settings
  getLMStudioSettings(): Promise<{ enabled: boolean; endpoint: string; model: string }> {
    return this.electronAPI.getLMStudioSettings();
  }

  saveLMStudioSettings(settings: { enabled: boolean; endpoint: string; model: string }): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.saveLMStudioSettings(settings);
  }

  testLMStudioConnection(): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.testLMStudioConnection();
  }

  // Documents
  openFileDialog(): Promise<{ canceled: boolean; filePath?: string }> {
    return this.electronAPI.openFileDialog();
  }

  askAboutFileWithOpenAI(filePath: string, question: string): Promise<{ success: boolean; answer?: string; error?: string }> {
    return this.electronAPI.askAboutFileWithOpenAI(filePath, question);
  }

  clearActiveDocContext(): Promise<{ success: boolean }> {
    return this.electronAPI.clearActiveDocContext();
  }

  getActiveDocInfo(): Promise<{ hasContext: boolean; fileName?: string; length?: number }> {
    return this.electronAPI.getActiveDocInfo();
  }

  listDocs(): Promise<{ success: boolean; docs: Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean; hasKeyInfo?: boolean; keyInfoLength?: number }> }> {
    return this.electronAPI.listDocs();
  }

  setActiveDoc(filePath: string): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.setActiveDoc(filePath);
  }

  removeDoc(filePath: string): Promise<{ success: boolean; error?: string }> {
    return this.electronAPI.removeDoc(filePath);
  }

  getDocKeyInfo(filePath: string): Promise<{ success: boolean; fileName?: string; keyInfo?: string; hasKeyInfo?: boolean; contentLength?: number; keyInfoLength?: number; error?: string }> {
    return this.electronAPI.getDocKeyInfo(filePath);
  }

  saveDocKeyInfo(filePath: string, keyInfo: string): Promise<{ success: boolean; keyInfoLength?: number; error?: string }> {
    return this.electronAPI.saveDocKeyInfo(filePath, keyInfo);
  }

  importDocumentWithKeyInfo(filePath: string): Promise<{ success: boolean; fileName?: string; contentLength?: number; keyInfoLength?: number; hasKeyInfo?: boolean; error?: string }> {
    return this.electronAPI.importDocumentWithKeyInfo(filePath);
  }

  // Event Observables - return shared subjects to avoid memory leaks
  onScreenshotTaken(): Observable<any> {
    return this.screenshotTaken$.asObservable();
  }

  onProcessScreenshots(): Observable<void> {
    return this.processScreenshots$.asObservable();
  }

  onScreenshotsCleared(): Observable<void> {
    return this.screenshotsCleared$.asObservable();
  }

  onAnswerStyleChanged(): Observable<string> {
    return this.answerStyleChanged$.asObservable();
  }

  onModelChanged(): Observable<'openai' | 'gemini' | 'both' | 'lmstudio'> {
    return this.modelChanged$.asObservable();
  }

  onSwitchTab(): Observable<string> {
    return this.switchTab$.asObservable();
  }

  onResponseCopied(): Observable<void> {
    return this.responseCopied$.asObservable();
  }

  onProcessClipboardPrompt(): Observable<void> {
    return this.processClipboardPrompt$.asObservable();
  }

  onTriggerRegionScreenshot(): Observable<void> {
    return this.triggerRegionScreenshot$.asObservable();
  }

  onExtractTextFromScreenshots(): Observable<void> {
    return this.extractTextFromScreenshots$.asObservable();
  }

  onToast(): Observable<string> {
    return this.toast$.asObservable();
  }

  onHistoryUpdated(): Observable<void> {
    return this.historyUpdated$.asObservable();
  }

  onWindowShown(): Observable<void> {
    return this.windowShown$.asObservable();
  }

  onDocumentsUpdated(): Observable<void> {
    return this.documentsUpdated$.asObservable();
  }

  // Show toast message
  showToast(message: string): void {
    this.toast$.next(message);
  }

  // History Management (using localStorage for simplicity)
  async getHistory(): Promise<HistoryItem[]> {
    try {
      const stored = localStorage.getItem(this.HISTORY_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Error loading history:', error);
      return [];
    }
  }

  async saveHistoryItem(item: HistoryItem): Promise<void> {
    try {
      const history = await this.getHistory();
      // Add new item at the beginning (most recent first)
      history.unshift(item);
      // Keep only last 50 items to prevent storage bloat
      const trimmed = history.slice(0, 50);
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(trimmed));
      this.historyUpdated$.next();
    } catch (error) {
      console.error('Error saving history item:', error);
    }
  }

  async updateHistoryItem(item: HistoryItem): Promise<void> {
    try {
      const history = await this.getHistory();
      const index = history.findIndex(h => h.id === item.id);
      if (index >= 0) {
        history[index] = item;
        localStorage.setItem(this.HISTORY_KEY, JSON.stringify(history));
        this.historyUpdated$.next();
      }
    } catch (error) {
      console.error('Error updating history item:', error);
    }
  }

  async deleteHistoryItem(id: string): Promise<void> {
    try {
      const history = await this.getHistory();
      const filtered = history.filter(item => item.id !== id);
      localStorage.setItem(this.HISTORY_KEY, JSON.stringify(filtered));
      this.historyUpdated$.next();
    } catch (error) {
      console.error('Error deleting history item:', error);
    }
  }

  async clearHistory(): Promise<void> {
    try {
      localStorage.removeItem(this.HISTORY_KEY);
      this.historyUpdated$.next();
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }

  // Mock API for development
  private createMockAPI(): ElectronAPI {
    return {
      sendPrompt: () => Promise.resolve('Mock response'),
      sendPromptToOpenAI: () => Promise.resolve('Mock OpenAI response'),
      sendPromptToGemini: () => Promise.resolve('Mock Gemini response'),
      sendPromptToLMStudio: () => Promise.resolve('Mock LM Studio response'),
      sendPromptWithScreenshotsToOpenAI: () => Promise.resolve('Mock OpenAI response with screenshots'),
      sendPromptWithScreenshotsToGemini: () => Promise.resolve('Mock Gemini response with screenshots'),
      sendConversationToOpenAI: () => Promise.resolve('Mock OpenAI conversation response'),
      sendConversationToGemini: () => Promise.resolve('Mock Gemini conversation response'),
      sendConversationToLMStudio: () => Promise.resolve('Mock LM Studio conversation response'),
      closeWindow: () => {},
      hideWindow: () => {},
      showWindow: () => {},
      moveWindow: () => {},
      takeScreenshot: () => Promise.resolve({ success: false, error: 'Not in Electron' }),
      takeRegionScreenshot: () => Promise.resolve({ success: false }),
      captureRegion: () => {},
      cancelRegionScreenshot: () => {},
      analyzeScreenshots: () => Promise.resolve({ success: false }),
      analyzeScreenshotsWithOpenAI: () => Promise.resolve({ success: false }),
      analyzeScreenshotsWithGemini: () => Promise.resolve({ success: false }),
      extractTextFromScreenshots: () => Promise.resolve({ success: false }),
      importClipboardImage: () => Promise.resolve({ success: false }),
      openFileDialog: () => Promise.resolve({ canceled: true }),
      askAboutFileWithOpenAI: () => Promise.resolve({ success: false }),
      importDocumentWithKeyInfo: () => Promise.resolve({ success: false }),
      clearActiveDocContext: () => Promise.resolve({ success: false }),
      getActiveDocInfo: () => Promise.resolve({ hasContext: false }),
      listDocs: () => Promise.resolve({ success: false, docs: [] }),
      setActiveDoc: () => Promise.resolve({ success: false }),
      removeDoc: () => Promise.resolve({ success: false }),
      getDocKeyInfo: () => Promise.resolve({ success: false }),
      saveDocKeyInfo: () => Promise.resolve({ success: false }),
      saveApiKey: () => Promise.resolve({ success: false }),
      getApiKey: () => Promise.resolve(''),
      saveGeminiApiKey: () => Promise.resolve({ success: false }),
      getGeminiApiKey: () => Promise.resolve(''),
      saveOpenAIApiKey: () => Promise.resolve({ success: false }),
      getOpenAIApiKey: () => Promise.resolve(''),
      savePreferences: () => Promise.resolve({ success: false }),
      getPreferences: () => Promise.resolve({ preferredLanguage: 'python', answerStyle: 'explanation' }),
      saveDefaultModel: () => Promise.resolve({ success: false }),
      getDefaultModel: () => Promise.resolve('both'),
      saveOpenAIModel: () => Promise.resolve({ success: false }),
      getOpenAIModel: () => Promise.resolve(''),
      saveCustomSystemPrompt: () => Promise.resolve({ success: false }),
      getCustomSystemPrompt: () => Promise.resolve(''),
      getUserPromptTemplates: () => Promise.resolve([]),
      saveUserPromptTemplate: () => Promise.resolve({ success: false }),
      deleteUserPromptTemplate: () => Promise.resolve({ success: false }),
      getPromptTemplates: () => Promise.resolve([]),
      savePromptTemplate: () => Promise.resolve({ success: false }),
      deletePromptTemplate: () => Promise.resolve({ success: false }),
      resetPromptTemplates: () => Promise.resolve({ success: false }),
      getOCRSettings: () => Promise.resolve({ enabled: false, language: 'eng' }),
      saveOCRSettings: () => Promise.resolve({ success: false }),
      testOCR: () => Promise.resolve({ success: false, error: 'Not in Electron' }),
      getLMStudioSettings: () => Promise.resolve({ enabled: false, endpoint: 'http://localhost:1234/v1', model: 'local-model' }),
      saveLMStudioSettings: () => Promise.resolve({ success: false }),
      testLMStudioConnection: () => Promise.resolve({ success: false, error: 'Not in Electron' }),
      copyLatestResponse: () => Promise.resolve({ success: false }),
      processClipboardPrompt: () => Promise.resolve({ success: false }),
      getScreenshots: () => Promise.resolve([]),
      removeScreenshot: () => Promise.resolve({ success: false }),
      onScreenshotTaken: () => () => {},
      onProcessScreenshots: () => () => {},
      onAnswerStyleChanged: () => () => {},
      onModelChanged: () => () => {},
      onOpenAIModelChanged: () => () => {},
      onExtractTextFromScreenshots: () => () => {},
      onScreenshotsCleared: () => () => {},
      onSwitchTab: () => () => {},
      onResponseCopied: () => () => {},
      onProcessClipboardPrompt: () => () => {},
      onTriggerRegionScreenshot: () => () => {},
      onOverlayUpdate: () => () => {},
      onToast: () => () => {},
      onWindowShown: () => () => {},
      onDocumentsUpdated: () => () => {}
    } as ElectronAPI;
  }
}