/**
 * Electron Store configuration and initialization
 */
import { AI_CONFIG } from './ai/clients';
import { DEFAULT_PROMPT_TEMPLATES } from './constants/prompts';
import { DEFAULT_ANSWER_STYLE, DEFAULT_LANGUAGE } from './constants/answer-styles';
import { AI_PROVIDER, LMSTUDIO_CONFIG } from './constants/ai';
import { DEFAULT_WINDOW } from './constants/app';
import { OCR_CONFIG, OCRLanguage } from './constants/ocr';

const Store = require('electron-store');

export interface StoreSchema {
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  preferredLanguage: string;
  answerStyle: 'code' | 'explanation' | 'multiple-choice';
  defaultModel: 'both' | 'openai' | 'gemini' | 'lmstudio';
  openaiModel: string;
  customSystemPrompt: string;
  promptTemplates: Array<{ id: string; name: string; prompt: string }>;
  apiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  // OCR settings
  ocrEnabled: boolean;
  ocrLanguage: OCRLanguage;
  // LM Studio settings
  lmstudioEnabled: boolean;
  lmstudioEndpoint: string;
  lmstudioModel: string;
  // Voice transcription settings
  voiceTranscriptionProvider: 'openai' | 'gemini';
  voiceScreenshotMode: 'full' | 'region' | 'none';
  // Window behavior
  autoInteractionOnShow: boolean;
  // Note view mode: 'editor-only' shows the rendered preview only inside the
  // note editor (current default); 'alongside' also renders the active note
  // next to the AI responses so the user can read it while reading the answer.
  noteViewMode: 'editor-only' | 'alongside';
}

export const STORE_DEFAULTS: StoreSchema = {
  windowPosition: DEFAULT_WINDOW.position,
  windowSize: DEFAULT_WINDOW.size,
  preferredLanguage: DEFAULT_LANGUAGE,
  answerStyle: DEFAULT_ANSWER_STYLE,
  defaultModel: AI_PROVIDER.BOTH,
  openaiModel: AI_CONFIG.openai.model,
  customSystemPrompt: '',
  promptTemplates: DEFAULT_PROMPT_TEMPLATES,
  // OCR defaults
  ocrEnabled: OCR_CONFIG.DEFAULT_ENABLED,
  ocrLanguage: OCR_CONFIG.DEFAULT_LANGUAGE,
  // LM Studio defaults
  lmstudioEnabled: false,
  lmstudioEndpoint: LMSTUDIO_CONFIG.DEFAULT_ENDPOINT,
  lmstudioModel: LMSTUDIO_CONFIG.DEFAULT_MODEL,
  // Voice transcription default
  voiceTranscriptionProvider: 'openai',
  voiceScreenshotMode: 'full',
  // Window behavior default — keep current click-through-on-show behavior
  // unless the user opts in to auto-interaction.
  autoInteractionOnShow: false,
  // Default keeps the current behaviour: notes only render in the editor.
  noteViewMode: 'editor-only',
};

export function createStore() {
  const store = new Store({ defaults: STORE_DEFAULTS });
  
  // Seed templates on first run (if empty or missing)
  const existingTemplates = store.get('promptTemplates');
  if (!existingTemplates || (Array.isArray(existingTemplates) && existingTemplates.length === 0)) {
    store.set('promptTemplates', DEFAULT_PROMPT_TEMPLATES);
  }
  
  return store;
}

export type AppStore = ReturnType<typeof createStore>;
