/**
 * OCR-related constants
 */

export const OCR_LANGUAGE = {
  ENGLISH: 'eng',
  CHINESE_SIMPLIFIED: 'chi_sim',
  CHINESE_TRADITIONAL: 'chi_tra',
  JAPANESE: 'jpn',
  KOREAN: 'kor',
  VIETNAMESE: 'vie',
  SPANISH: 'spa',
  FRENCH: 'fra',
  GERMAN: 'deu',
} as const;

export type OCRLanguage = typeof OCR_LANGUAGE[keyof typeof OCR_LANGUAGE];

export const OCR_LANGUAGES = [
  { id: OCR_LANGUAGE.ENGLISH, name: 'English' },
  { id: OCR_LANGUAGE.CHINESE_SIMPLIFIED, name: 'Chinese (Simplified)' },
  { id: OCR_LANGUAGE.CHINESE_TRADITIONAL, name: 'Chinese (Traditional)' },
  { id: OCR_LANGUAGE.JAPANESE, name: 'Japanese' },
  { id: OCR_LANGUAGE.KOREAN, name: 'Korean' },
  { id: OCR_LANGUAGE.VIETNAMESE, name: 'Vietnamese' },
  { id: OCR_LANGUAGE.SPANISH, name: 'Spanish' },
  { id: OCR_LANGUAGE.FRENCH, name: 'French' },
  { id: OCR_LANGUAGE.GERMAN, name: 'German' },
] as const;

export const OCR_CONFIG = {
  MIN_CONFIDENCE: 60,  // Below this, warn user about low accuracy
  DEFAULT_LANGUAGE: OCR_LANGUAGE.ENGLISH,
  DEFAULT_ENABLED: false,
} as const;
