/**
 * AI prompt IPC handlers for OpenAI and Gemini
 */
import { clipboard, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';

import { 
  getApiKey, 
  getCurrentOpenAIModel, 
  getGeminiClient, 
  getOpenAIClient, 
  sendConversationToGemini, 
  sendConversationToOpenAI, 
  sendPromptToGemini, 
  sendPromptToOpenAI,
  sendPromptToLMStudio,
  sendConversationToLMStudio,
  testLMStudioConnection,
  getLMStudioSettings
} from '../ai/clients';
import { generatePrompt } from '../ai/prompts';
import { buildDocContextPrefix } from './documents';
import { overlayManager } from './overlay';
import { getScreenshotQueue } from './screenshots';
import { imageToBase64 } from '../utils/files';
import { getMainWindow } from '../window';
import type { AppStore } from '../store';
import { extractTextFromImages, combineOCRResults, isConfidenceAcceptable, OCRResult } from '../ocr';

const { createPartFromUri } = require('@google/genai');

// State for latest AI response
let latestAIResponse: string = '';

export const getLatestAIResponse = () => latestAIResponse;
export const setLatestAIResponse = (response: string) => { latestAIResponse = response; };

/**
 * Build OCR context prefix if OCR is enabled and has results
 */
function buildOCRContextPrefix(ocrResult: OCRResult | null, log: any): string {
  if (!ocrResult || !ocrResult.success || !ocrResult.text.trim()) {
    return '';
  }

  const confidenceNote = !isConfidenceAcceptable(ocrResult.confidence) 
    ? ` (Note: OCR confidence is low at ${ocrResult.confidence.toFixed(0)}%, text may be inaccurate)`
    : '';

  log.info(`OCR: Adding extracted text to prompt (${ocrResult.text.length} chars, ${ocrResult.confidence.toFixed(0)}% confidence)`);
  // Log the actual extracted text for debugging
  log.info(`OCR Extracted Text:\n---\n${ocrResult.text}\n---`);
  
  return `[Extracted Text from Screenshot(s)]${confidenceNote}\n${ocrResult.text}\n[End Extracted Text]\n\n`;
}

/**
 * Process screenshots with OCR if enabled
 */
async function processScreenshotsWithOCR(
  screenshots: string[],
  store: AppStore,
  log: any
): Promise<{ ocrResult: OCRResult | null; shouldIncludeImages: boolean }> {
  const ocrEnabled = store.get('ocrEnabled', false);
  
  if (!ocrEnabled || screenshots.length === 0) {
    return { ocrResult: null, shouldIncludeImages: true };
  }

  log.info(`OCR: Processing ${screenshots.length} screenshot(s)`);
  const ocrLanguage = store.get('ocrLanguage', 'eng');
  
  const results = await extractTextFromImages(screenshots, ocrLanguage);
  const combined = combineOCRResults(results);

  // When OCR is enabled, don't send images (text-only mode)
  const shouldIncludeImages = !combined.success;
  
  return { ocrResult: combined, shouldIncludeImages };
}

export function registerAIIPC(
  deps: {
    store: AppStore;
    log: any;
    preloadPath: string;
  }
) {
  const { store, log, preloadPath } = deps;

  // Helper to update response state and show overlay
  const handleAIResponse = (response: string) => {
    latestAIResponse = response;
    overlayManager.setLatestResponse(response);
    overlayManager.autoShow(response, 2000, preloadPath);
  };

  // Test OCR - extract text from screenshots without sending to AI
  ipcMain.handle('testOCR', async () => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available' };
    }

    try {
      const ocrLanguage = store.get('ocrLanguage', 'eng');
      
      const results = await extractTextFromImages([...screenshotQueue], ocrLanguage);
      const combined = combineOCRResults(results);
      
      return {
        success: combined.success,
        text: combined.text,
        confidence: combined.confidence,
        error: combined.error,
      };
    } catch (error) {
      log.error('OCR Test failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Simple prompt handlers
  ipcMain.handle('sendPromptToGemini', async (_event: IpcMainInvokeEvent, prompt: string) => {
    try {
      log.info('Sending request to Google Gemini API');
      const docPrefix = buildDocContextPrefix();
      const finalPrompt = docPrefix ? `${docPrefix}\n\n${prompt}` : prompt;
      const result = await sendPromptToGemini([finalPrompt], store);

      const assistantReply = result.text || 'No response from Google Gemini.';
      handleAIResponse(assistantReply);

      log.info('Received response from Google Gemini API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Google Gemini:', error);
      throw new Error(`Failed to fetch from Google Gemini: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendPromptToOpenAI', async (_event: IpcMainInvokeEvent, prompt: string) => {
    try {
      log.info('Sending request to OpenAI API');
      const docPrefix = buildDocContextPrefix();
      const finalPrompt = docPrefix ? `${docPrefix}\n\n${prompt}` : prompt;
      const assistantReply = await sendPromptToOpenAI(finalPrompt, store);
      
      handleAIResponse(assistantReply);

      log.info('Received response from OpenAI API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from OpenAI:', error);
      throw new Error(`Failed to fetch from OpenAI: ${(error as Error).message}`);
    }
  });

  // Conversation-aware prompts (with history)
  ipcMain.handle('sendConversationToOpenAI', async (_event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    try {
      log.info('Sending conversation request to OpenAI API');
      const assistantReply = await sendConversationToOpenAI(messages, store);
      
      handleAIResponse(assistantReply);

      log.info('Received conversation response from OpenAI API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch conversation from OpenAI:', error);
      throw new Error(`Failed to fetch conversation from OpenAI: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendConversationToGemini', async (_event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    try {
      log.info('Sending conversation request to Gemini API');
      const assistantReply = await sendConversationToGemini(messages, store);
      
      handleAIResponse(assistantReply);

      log.info('Received conversation response from Gemini API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch conversation from Gemini:', error);
      throw new Error(`Failed to fetch conversation from Gemini: ${(error as Error).message}`);
    }
  });

  // LM Studio handlers
  ipcMain.handle('sendPromptToLMStudio', async (_event: IpcMainInvokeEvent, prompt: string) => {
    try {
      log.info('Sending request to LM Studio');
      const docPrefix = buildDocContextPrefix();
      const finalPrompt = docPrefix ? `${docPrefix}\n\n${prompt}` : prompt;
      const assistantReply = await sendPromptToLMStudio(finalPrompt, store);
      
      handleAIResponse(assistantReply);

      log.info('Received response from LM Studio');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from LM Studio:', error);
      throw new Error(`Failed to fetch from LM Studio: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendConversationToLMStudio', async (_event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
    try {
      log.info('Sending conversation request to LM Studio');
      const assistantReply = await sendConversationToLMStudio(messages, store);
      
      handleAIResponse(assistantReply);

      log.info('Received conversation response from LM Studio');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch conversation from LM Studio:', error);
      throw new Error(`Failed to fetch conversation from LM Studio: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('testLMStudioConnection', async () => {
    try {
      log.info('Testing LM Studio connection');
      const result = await testLMStudioConnection(store);
      log.info('LM Studio connection test result:', result);
      return result;
    } catch (error) {
      log.error('LM Studio connection test failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Prompt with screenshots
  ipcMain.handle('sendPromptWithScreenshotsToOpenAI', async (_event: IpcMainInvokeEvent, prompt: string) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return ipcMain.emit('sendPromptToOpenAI', _event, prompt);
    }

    try {
      log.info('Sending prompt with screenshots to OpenAI API');
      const openai = getOpenAIClient(store);
      const screenshots = [...screenshotQueue];
      const docPrefix = buildDocContextPrefix();
      
      // Process OCR if enabled
      const { ocrResult, shouldIncludeImages } = await processScreenshotsWithOCR(screenshots, store, log);
      const ocrPrefix = buildOCRContextPrefix(ocrResult, log);
      
      const finalPrompt = `${docPrefix ? docPrefix + '\n\n' : ''}${ocrPrefix}${prompt}`;

      const content: ChatCompletionContentPart[] = [{ type: "text", text: finalPrompt }];

      // Only include images if OCR mode requires it
      if (shouldIncludeImages) {
        for (const screenshotPath of screenshots) {
          try {
            const base64Image = imageToBase64(screenshotPath);
            content.push({
              type: "image_url",
              image_url: { url: `data:image/png;base64,${base64Image}` }
            } as ChatCompletionContentPart);
          } catch (error) {
            log.error(`Error processing image ${screenshotPath}:`, error);
          }
        }
      }

      const response = await openai.chat.completions.create({
        model: getCurrentOpenAIModel(store),
        messages: [{ role: 'user', content }],
      });

      const assistantReply = response.choices[0]?.message?.content || 'No response from OpenAI.';
      handleAIResponse(assistantReply);

      log.info('Received response from OpenAI API with screenshots');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from OpenAI with screenshots:', error);
      throw new Error(`Failed to fetch from OpenAI: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendPromptWithScreenshotsToGemini', async (_event: IpcMainInvokeEvent, prompt: string) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return ipcMain.emit('sendPromptToGemini', _event, prompt);
    }

    try {
      log.info('Sending prompt with screenshots to Gemini API');
      const ai = getGeminiClient(store);
      const screenshots = [...screenshotQueue];
      const docPrefix = buildDocContextPrefix();
      
      // Process OCR if enabled
      const { ocrResult, shouldIncludeImages } = await processScreenshotsWithOCR(screenshots, store, log);
      const ocrPrefix = buildOCRContextPrefix(ocrResult, log);
      
      const finalPrompt = `${docPrefix ? docPrefix + '\n\n' : ''}${ocrPrefix}${prompt}`;

      const parts: any[] = [finalPrompt];
      
      // Only include images if OCR mode requires it
      if (shouldIncludeImages) {
        for (const screenshotPath of screenshots) {
          try {
            const image = await ai.files.upload({ file: screenshotPath });
            parts.push(createPartFromUri(image.uri, image.mimeType));
          } catch (error) {
            log.error(`Error processing image ${screenshotPath}:`, error);
          }
        }
      }

      const result = await sendPromptToGemini(parts, store);
      const assistantReply = result.text || 'No response from Gemini.';
      
      handleAIResponse(assistantReply);

      log.info('Received response from Gemini API with screenshots');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Gemini with screenshots:', error);
      throw new Error(`Failed to fetch from Gemini: ${(error as Error).message}`);
    }
  });

  // Screenshot Analysis
  const analyzeScreenshotsWithGemini = async (options: { language?: string }) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available to analyze' };
    }

    try {
      const ai = getGeminiClient(store);
      const screenshots = [...screenshotQueue];
      const language = options.language || store.get('preferredLanguage') || 'python';
      const answerStyle = store.get('answerStyle', 'code');
      const docPrefix = buildDocContextPrefix();
      
      // Process OCR if enabled
      const { ocrResult, shouldIncludeImages } = await processScreenshotsWithOCR(screenshots, store, log);
      const ocrPrefix = buildOCRContextPrefix(ocrResult, log);
      
      const promptText = generatePrompt(answerStyle, language, undefined, docPrefix ? `${docPrefix}\n\n${ocrPrefix}` : ocrPrefix);

      const parts: any[] = [promptText];
      
      // Only include images if OCR mode requires it
      if (shouldIncludeImages) {
        for (const screenshotPath of screenshots) {
          try {
            const image = await ai.files.upload({ file: screenshotPath });
            parts.push(createPartFromUri(image.uri, image.mimeType));
          } catch (error) {
            log.error(`Error processing image ${screenshotPath}:`, error);
          }
        }
      }

      const result = await sendPromptToGemini(parts, store);
      const analysis = result.text || 'Analysis completed, but no specific solution was generated.';
      
      handleAIResponse(analysis);

      return { success: true, analysis, screenshots };
    } catch (error) {
      log.error('Error analyzing screenshots with Gemini:', error);
      return { success: false, error: (error as Error).message };
    }
  };

  const analyzeScreenshotsWithOpenAI = async (options: { language?: string }) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available to analyze' };
    }

    try {
      const openai = getOpenAIClient(store);
      const screenshots = [...screenshotQueue];
      const language = options.language || store.get('preferredLanguage') || 'python';
      const answerStyle = store.get('answerStyle') || 'code';
      const docPrefix = buildDocContextPrefix();
      
      // Process OCR if enabled
      const { ocrResult, shouldIncludeImages } = await processScreenshotsWithOCR(screenshots, store, log);
      const ocrPrefix = buildOCRContextPrefix(ocrResult, log);
      
      const promptText = generatePrompt(answerStyle, language, undefined, docPrefix ? `${docPrefix}\n\n${ocrPrefix}` : ocrPrefix);

      const content: ChatCompletionContentPart[] = [{ type: "text", text: promptText }];

      // Only include images if OCR mode requires it
      if (shouldIncludeImages) {
        for (const screenshotPath of screenshots) {
          try {
            const base64Image = imageToBase64(screenshotPath);
            content.push({
              type: "image_url",
              image_url: { url: `data:image/png;base64,${base64Image}` }
            } as ChatCompletionContentPart);
          } catch (error) {
            log.error(`Error processing image ${screenshotPath}:`, error);
          }
        }
      }

      const response = await openai.chat.completions.create({
        model: getCurrentOpenAIModel(store),
        messages: [{ role: 'user', content }],
      });

      const analysis = response.choices[0]?.message?.content || 'Analysis completed, but no specific solution was generated.';
      handleAIResponse(analysis);

      return { success: true, analysis, screenshots };
    } catch (error) {
      log.error('Error analyzing screenshots with OpenAI:', error);
      return { success: false, error: (error as Error).message };
    }
  };

  ipcMain.handle('analyze-screenshots', async (_event, options: { language?: string }) => 
    analyzeScreenshotsWithGemini(options));
  ipcMain.handle('analyzeScreenshotsWithGemini', async (_event, options: { language?: string }) => 
    analyzeScreenshotsWithGemini(options));
  ipcMain.handle('analyzeScreenshotsWithOpenAI', async (_event, options: { language?: string }) => 
    analyzeScreenshotsWithOpenAI(options));

  // Text extraction from screenshots
  const extractWithOpenAI = async (screenshots: string[], extractPrompt: string): Promise<string> => {
    const openai = getOpenAIClient(store);
    const content: ChatCompletionContentPart[] = [{ type: "text", text: extractPrompt }];

    for (const screenshotPath of screenshots) {
      try {
        const base64Image = imageToBase64(screenshotPath);
        content.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64Image}` }
        } as ChatCompletionContentPart);
      } catch (error) {
        log.error(`Error processing image ${screenshotPath}:`, error);
      }
    }

    const response = await openai.chat.completions.create({
      model: getCurrentOpenAIModel(store),
      messages: [{ role: 'user', content }],
    });

    return response.choices[0]?.message?.content || 'No text extracted';
  };

  ipcMain.handle('extractTextFromScreenshots', async () => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available to extract text from' };
    }

    try {
      const screenshots = [...screenshotQueue];
      let extractedText = '';

      // Check if OCR is enabled - use OCR instead of AI
      // Also force OCR when LM Studio is selected (since it's text-only)
      const defaultModel = store.get('defaultModel', 'both');
      const lmstudioEnabled = store.get('lmstudioEnabled', false);
      const ocrEnabled = store.get('ocrEnabled', false) || (defaultModel === 'lmstudio' && lmstudioEnabled);
      
      if (ocrEnabled) {
        // Use Tesseract OCR (fast, free, local)
        log.info('Extract Text: Using OCR (enabled in settings)');
        const ocrLanguage = store.get('ocrLanguage', 'eng');
        const results = await extractTextFromImages(screenshots, ocrLanguage);
        const combined = combineOCRResults(results);
        
        if (combined.success && combined.text) {
          extractedText = combined.text;
          log.info(`OCR extraction completed: ${extractedText.length} chars, ${combined.confidence.toFixed(0)}% confidence`);
        } else {
          return { success: false, error: combined.error || 'OCR failed to extract text' };
        }
      } else {
        // Use AI extraction (original behavior)
        log.info('Extract Text: Using AI (OCR disabled)');
        const extractPrompt = `Please extract and list all the text you can see in these screenshots. Only return the extracted text, no analysis or explanation.\n\n[EXTRACTED TEXT]`;

        const geminiKey = getApiKey('gemini', store, log);
        const openaiKey = getApiKey('openai', store, log);

        if (geminiKey) {
          try {
            const ai = getGeminiClient(store);
            const parts = [extractPrompt];

            for (const screenshotPath of screenshots) {
              try {
                const image = await ai.files.upload({ file: screenshotPath });
                parts.push(createPartFromUri(image.uri, image.mimeType));
              } catch (error) {
                log.error(`Error processing image ${screenshotPath}:`, error);
              }
            }

            const result = await sendPromptToGemini(parts, store);
            extractedText = result.text || 'No text extracted';
          } catch (geminiError) {
            log.warn('Gemini extraction failed, falling back to OpenAI:', geminiError);
            if (openaiKey) {
              extractedText = await extractWithOpenAI(screenshots, extractPrompt);
            } else {
              throw new Error('Gemini extraction failed and no OpenAI API key available');
            }
          }
        } else if (openaiKey) {
          extractedText = await extractWithOpenAI(screenshots, extractPrompt);
        } else {
          throw new Error('No API key configured. Please set either Gemini or OpenAI API key in Settings, or enable OCR.');
        }
      }
      
      clipboard.writeText(extractedText);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('process-clipboard-prompt');
      }

      return { success: true, extractedText };
    } catch (error) {
      log.error('Error extracting text from screenshots:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Copy latest response
  ipcMain.handle('copy-latest-response', () => {
    try {
      if (latestAIResponse) {
        clipboard.writeText(latestAIResponse);
        return { success: true };
      }
      return { success: false, error: 'No response available to copy' };
    } catch (error) {
      log.error('Error copying to clipboard:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Clipboard prompt processing
  ipcMain.handle('processClipboardPrompt', async () => {
    try {
      const clipboardText = clipboard.readText().trim();
      if (!clipboardText) {
        return { success: false, error: 'No text found in clipboard' };
      }

      const defaultModel = store.get('defaultModel') || 'both';
      const answerStyle = store.get('answerStyle', 'explanation');
      const language = store.get('preferredLanguage') || 'python';
      const docPrefix = buildDocContextPrefix();
      const promptText = generatePrompt(answerStyle, language, clipboardText, docPrefix);

      const promises = [];
      let openaiResponse = '';
      let geminiResponse = '';
      let lmstudioResponse = '';
      
      if (defaultModel === 'both' || defaultModel === 'openai') {
        promises.push(
          sendPromptToOpenAI(promptText, store)
            .then(response => {
              openaiResponse = response;
              handleAIResponse(response);
              return response;
            })
            .catch((error: Error) => {
              openaiResponse = `OpenAI Error: ${error.message}`;
              return openaiResponse;
            })
        );
      }
      
      if (defaultModel === 'both' || defaultModel === 'gemini') {
        promises.push(
          sendPromptToGemini([promptText], store)
            .then((result: any) => {
              const response = result.text || 'No response from Gemini';
              geminiResponse = response;
              handleAIResponse(response);
              return response;
            })
            .catch((error: Error) => {
              geminiResponse = `Gemini Error: ${error.message}`;
              return geminiResponse;
            })
        );
      }

      // LM Studio (local model)
      if (defaultModel === 'lmstudio') {
        promises.push(
          sendPromptToLMStudio(promptText, store)
            .then(response => {
              lmstudioResponse = response;
              handleAIResponse(response);
              return response;
            })
            .catch((error: Error) => {
              lmstudioResponse = `LM Studio Error: ${error.message}`;
              return lmstudioResponse;
            })
        );
      }

      await Promise.allSettled(promises);
      const finalResponse = latestAIResponse || openaiResponse || geminiResponse || lmstudioResponse || 'No response received';

      if (finalResponse && finalResponse !== 'No response received') {
        clipboard.writeText(finalResponse);
      }

      return {
        success: true,
        prompt: clipboardText,
        openaiResponse,
        geminiResponse,
        lmstudioResponse
      };
    } catch (error) {
      log.error('Error processing clipboard prompt via IPC:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
