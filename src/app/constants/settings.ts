/**
 * Shared constants for the Angular renderer
 * These should stay in sync with main process constants where applicable
 */

/** AI Provider options */
export const AI_PROVIDER = {
  OPENAI: 'openai',
  GEMINI: 'gemini',
  BOTH: 'both',
  LMSTUDIO: 'lmstudio',
  ZAI: 'zai',
} as const;

export type AIProvider = typeof AI_PROVIDER[keyof typeof AI_PROVIDER];

/** Answer style options */
export const ANSWER_STYLE = {
  CODE: 'code',
  EXPLANATION: 'explanation',
  MULTIPLE_CHOICE: 'multiple-choice',
} as const;

export type AnswerStyle = typeof ANSWER_STYLE[keyof typeof ANSWER_STYLE];

/** Default values */
export const DEFAULTS = {
  LANGUAGE: 'python',
  ANSWER_STYLE: ANSWER_STYLE.EXPLANATION as AnswerStyle,
  MODEL: AI_PROVIDER.BOTH as AIProvider,
} as const;

/** Local storage keys */
export const STORAGE_KEYS = {
  HISTORY: 'qa_history',
} as const;
