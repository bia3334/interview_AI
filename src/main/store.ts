/**
 * Electron Store configuration and initialization
 */
import { AI_CONFIG } from './ai/clients';
import { DEFAULT_PROMPT_TEMPLATES } from './constants/prompts';
import { DEFAULT_ANSWER_STYLE, DEFAULT_LANGUAGE } from './constants/answer-styles';
import { AI_PROVIDER } from './constants/ai';
import { DEFAULT_WINDOW } from './constants/app';

const Store = require('electron-store');

export interface StoreSchema {
  windowPosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  preferredLanguage: string;
  answerStyle: 'code' | 'explanation' | 'multiple-choice';
  defaultModel: 'both' | 'openai' | 'gemini';
  openaiModel: string;
  customSystemPrompt: string;
  promptTemplates: Array<{ id: string; name: string; prompt: string }>;
  apiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
}

export const STORE_DEFAULTS: StoreSchema = {
  windowPosition: DEFAULT_WINDOW.position,
  windowSize: DEFAULT_WINDOW.size,
  preferredLanguage: DEFAULT_LANGUAGE,
  answerStyle: DEFAULT_ANSWER_STYLE,
  defaultModel: AI_PROVIDER.BOTH,
  openaiModel: AI_CONFIG.openai.model,
  customSystemPrompt: '',
  promptTemplates: DEFAULT_PROMPT_TEMPLATES
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
