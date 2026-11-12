/**
 * What the AI clients read from the store: API keys, the custom system
 * prompt, and the shapes shared by every provider module.
 */
import { AI_MODELS, DEFAULT_AI_PROVIDER, LMSTUDIO_CONFIG, ZAI_CONFIG } from '../constants/ai';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type OnDelta = (delta: string) => void;
export type ConnectionTestResult = { success: boolean; model?: string; error?: string };
export type ApiKeyProvider = 'openai' | 'gemini' | 'zai' | 'claude';

export const AI_CONFIG = {
  default: DEFAULT_AI_PROVIDER,
  gemini: { model: AI_MODELS.gemini.default },
  openai: { model: AI_MODELS.openai.default },
  lmstudio: { endpoint: LMSTUDIO_CONFIG.DEFAULT_ENDPOINT, model: LMSTUDIO_CONFIG.DEFAULT_MODEL },
  zai: { baseUrl: ZAI_CONFIG.BASE_URL, model: ZAI_CONFIG.DEFAULT_MODEL },
  claude: { model: AI_MODELS.claude.default },
};

/** Where each provider's key lives: store keys first (in order), then the env var. */
const API_KEY_SOURCES: Record<ApiKeyProvider, { storeKeys: string[]; envVar: string }> = {
  openai: { storeKeys: ['openaiApiKey', 'apiKey'], envVar: 'OPENAI_API_KEY' },
  gemini: { storeKeys: ['geminiApiKey'], envVar: 'GEMINI_API_KEY' },
  zai: { storeKeys: ['zaiApiKey'], envVar: 'ZAI_API_KEY' },
  claude: { storeKeys: ['claudeApiKey'], envVar: 'ANTHROPIC_API_KEY' },
};

export const getApiKey = (type: ApiKeyProvider, store: any, log: any): string => {
  const { storeKeys, envVar } = API_KEY_SOURCES[type];
  const stored = storeKeys.map(k => store.get(k)).find(Boolean);
  const key = stored || process.env[envVar] || '';

  if (key) {
    log.info(`${type.toUpperCase()} API key found`);
  } else {
    log.warn(`No ${type.toUpperCase()} API key found`);
  }
  return key;
};

export const getCustomSystemPrompt = (store: any): string =>
  store.get('customSystemPrompt') || '';

/** Dumps an outgoing request to the dev console. */
export const logRequest = (title: string, fields: Record<string, unknown>) => {
  console.log(`\n========== ${title} ==========`);
  for (const [label, value] of Object.entries(fields)) {
    console.log(`${label}:`, value);
  }
  console.log('==============================\n');
};
