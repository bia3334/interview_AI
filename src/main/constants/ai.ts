/**
 * AI Models and Provider Configuration
 */

export const AI_PROVIDER = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  BOTH: 'both',
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
