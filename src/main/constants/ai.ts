/**
 * AI Models and Provider Configuration
 */

export const AI_PROVIDER = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  ZAI: 'zai',
  BOTH: 'both',
  LMSTUDIO: 'lmstudio',
  CLAUDE: 'claude',
} as const;

export type AIProvider = typeof AI_PROVIDER[keyof typeof AI_PROVIDER];

export const AI_MODELS = {
  openai: {
    default: 'gpt-5.4-mini',
  },
  gemini: {
    default: 'gemini-3.5-flash',
  },
  zai: {
    default: 'GLM-4.7-Flash',
  },
  claude: {
    default: 'claude-sonnet-4-6',
  },
} as const;

/** Z.AI default configuration */
export const ZAI_CONFIG = {
  BASE_URL: 'https://api.z.ai/api/paas/v4/',
  DEFAULT_MODEL: 'glm-4.7',
} as const;

/** Default AI provider */
export const DEFAULT_AI_PROVIDER: AIProvider = AI_PROVIDER.OPENAI;

/** LM Studio default configuration */
export const LMSTUDIO_CONFIG = {
  DEFAULT_ENDPOINT: 'http://localhost:1234/v1',
  DEFAULT_MODEL: 'local-model',
} as const;

/**
 * OpenAI-Compatible Provider Configuration
 * All these providers use the same OpenAI SDK format
 */
export interface OpenAICompatibleProvider {
  id: string;
  name: string;
  baseURL?: string;  // undefined = default OpenAI endpoint
  apiKeyStore: string;  // store key for API key
  modelStore: string;   // store key for model name
  defaultModel: string;
  requiresApiKey: boolean;
}

export const OPENAI_COMPATIBLE_PROVIDERS: Record<string, OpenAICompatibleProvider> = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseURL: undefined,  // uses default
    apiKeyStore: 'openaiApiKey',
    modelStore: 'openaiModel',
    defaultModel: AI_MODELS.openai.default,
    requiresApiKey: true,
  },
  zai: {
    id: 'zai',
    name: 'Z.AI',
    baseURL: ZAI_CONFIG.BASE_URL,
    apiKeyStore: 'zaiApiKey',
    modelStore: 'zaiModel',
    defaultModel: ZAI_CONFIG.DEFAULT_MODEL,
    requiresApiKey: true,
  },
  lmstudio: {
    id: 'lmstudio',
    name: 'LM Studio',
    baseURL: LMSTUDIO_CONFIG.DEFAULT_ENDPOINT,
    apiKeyStore: 'lmstudioApiKey',  // not used, but for consistency
    modelStore: 'lmstudioModel',
    defaultModel: LMSTUDIO_CONFIG.DEFAULT_MODEL,
    requiresApiKey: false,
  },
};
