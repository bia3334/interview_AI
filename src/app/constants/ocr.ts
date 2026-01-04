/**
 * OCR-related constants for Angular renderer
 */

export const OCR_LANGUAGES = [
  { id: 'eng', name: 'English' },
  { id: 'chi_sim', name: 'Chinese (Simplified)' },
  { id: 'chi_tra', name: 'Chinese (Traditional)' },
  { id: 'jpn', name: 'Japanese' },
  { id: 'kor', name: 'Korean' },
  { id: 'vie', name: 'Vietnamese' },
  { id: 'spa', name: 'Spanish' },
  { id: 'fra', name: 'French' },
  { id: 'deu', name: 'German' },
] as const;

export interface OCRSettings {
  enabled: boolean;
  language: string;
}

export const DEFAULT_OCR_SETTINGS: OCRSettings = {
  enabled: false,
  language: 'eng',
};
