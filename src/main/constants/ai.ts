/**
 * AI Models and Provider Configuration
 */

export const AI_PROVIDER = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  BOTH: 'both',
  LMSTUDIO: 'lmstudio',
} as const;

export type AIProvider = typeof AI_PROVIDER[keyof typeof AI_PROVIDER];

export const AI_MODELS = {
  openai: {
    default: 'gpt-5.1',
  },
  gemini: {
    default: 'gemini-2.5-flash',
  },
} as const;

/** Default AI provider */
export const DEFAULT_AI_PROVIDER: AIProvider = AI_PROVIDER.OPENAI;

/** LM Studio default configuration */
export const LMSTUDIO_CONFIG = {
  DEFAULT_ENDPOINT: 'http://localhost:1234/v1',
  DEFAULT_MODEL: 'local-model',
} as const;
