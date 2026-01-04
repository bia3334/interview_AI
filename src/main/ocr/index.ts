/**
 * OCR Module - Text extraction from images using Tesseract.js
 */

import Tesseract from 'tesseract.js';
import log from 'electron-log';
import { OCR_CONFIG, OCRLanguage } from '../constants/ocr';

export interface OCRResult {
  text: string;
  confidence: number;
  success: boolean;
  error?: string;
}

let worker: Tesseract.Worker | null = null;
let currentLanguage: OCRLanguage = OCR_CONFIG.DEFAULT_LANGUAGE;

/**
 * Initialize or get the Tesseract worker
 */
async function getWorker(language: OCRLanguage): Promise<Tesseract.Worker> {
  // If language changed or no worker, create new one
  if (!worker || currentLanguage !== language) {
    if (worker) {
      await worker.terminate();
    }
    
    log.info(`OCR: Initializing Tesseract worker with language: ${language}`);
    worker = await Tesseract.createWorker(language, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          log.debug(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      },
    });
    currentLanguage = language;
    log.info('OCR: Worker initialized successfully');
  }
  
  return worker;
}

/**
 * Extract text from an image file
 */
export async function extractTextFromImage(
  imagePath: string,
  language: OCRLanguage = OCR_CONFIG.DEFAULT_LANGUAGE
): Promise<OCRResult> {
  try {
    log.info(`OCR: Extracting text from: ${imagePath}`);
    const startTime = Date.now();
    
    const tesseractWorker = await getWorker(language);
    const result = await tesseractWorker.recognize(imagePath);
    
    const elapsed = Date.now() - startTime;
    log.info(`OCR: Completed in ${elapsed}ms, confidence: ${result.data.confidence.toFixed(1)}%`);
    
    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown OCR error';
    log.error('OCR: Extraction failed:', errorMessage);
    
    return {
      text: '',
      confidence: 0,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Extract text from base64 encoded image
 */
export async function extractTextFromBase64(
  base64Data: string,
  language: OCRLanguage = OCR_CONFIG.DEFAULT_LANGUAGE
): Promise<OCRResult> {
  try {
    // Ensure proper data URL format
    const dataUrl = base64Data.startsWith('data:') 
      ? base64Data 
      : `data:image/png;base64,${base64Data}`;
    
    log.info('OCR: Extracting text from base64 image');
    const startTime = Date.now();
    
    const tesseractWorker = await getWorker(language);
    const result = await tesseractWorker.recognize(dataUrl);
    
    const elapsed = Date.now() - startTime;
    log.info(`OCR: Completed in ${elapsed}ms, confidence: ${result.data.confidence.toFixed(1)}%`);
    
    return {
      text: result.data.text.trim(),
      confidence: result.data.confidence,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown OCR error';
    log.error('OCR: Extraction failed:', errorMessage);
    
    return {
      text: '',
      confidence: 0,
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Extract text from multiple images
 */
export async function extractTextFromImages(
  imagePaths: string[],
  language: OCRLanguage = OCR_CONFIG.DEFAULT_LANGUAGE
): Promise<OCRResult[]> {
  const results: OCRResult[] = [];
  
  for (const imagePath of imagePaths) {
    const result = await extractTextFromImage(imagePath, language);
    results.push(result);
  }
  
  return results;
}

/**
 * Combine multiple OCR results into a single text
 */
export function combineOCRResults(results: OCRResult[]): OCRResult {
  const successfulResults = results.filter(r => r.success && r.text.trim());
  
  if (successfulResults.length === 0) {
    return {
      text: '',
      confidence: 0,
      success: false,
      error: 'No text extracted from any image',
    };
  }
  
  // Just join the text with line breaks, no screenshot labels
  const combinedText = successfulResults
    .map(r => r.text.trim())
    .join('\n\n');
  
  const avgConfidence = successfulResults.reduce((sum, r) => sum + r.confidence, 0) / successfulResults.length;
  
  return {
    text: combinedText,
    confidence: avgConfidence,
    success: true,
  };
}

/**
 * Check if OCR confidence is acceptable
 */
export function isConfidenceAcceptable(confidence: number): boolean {
  return confidence >= OCR_CONFIG.MIN_CONFIDENCE;
}

/**
 * Cleanup worker on app exit
 */
export async function terminateOCRWorker(): Promise<void> {
  if (worker) {
    log.info('OCR: Terminating worker');
    await worker.terminate();
    worker = null;
  }
}
