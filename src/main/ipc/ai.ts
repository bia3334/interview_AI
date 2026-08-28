/**
 * AI prompt IPC handlers for OpenAI and Gemini
 */
import { clipboard, ipcMain, IpcMainInvokeEvent } from 'electron';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';

import {
  getApiKey,
  getCurrentOpenAIModel,
  getGeminiClient,
  getOpenAIClient,
  sendConversationToGemini,
  sendConversationToLMStudio,
  sendConversationToOpenAI,
  sendConversationToZAI,
  sendPromptToGemini,
  sendPromptToLMStudio,
  sendPromptToOpenAI,
  sendPromptToZAI,
  streamChatCompletion,
  streamConversationToGemini,
  streamConversationToLMStudio,
  streamConversationToOpenAI,
  streamConversationToZAI,
  streamPromptToGemini,
  streamPromptToLMStudio,
  streamPromptToOpenAI,
  streamPromptToZAI,
  testLMStudioConnection,
  testZAIConnection,
  testOpenAIConnection,
  testGeminiConnection,
  sendPromptToClaude,
  sendConversationToClaude,
  sendPromptWithScreenshotsToClaude,
  testClaudeConnection,
  streamPromptToClaude,
  streamConversationToClaude,
  streamPromptWithScreenshotsToClaude,
  recordTokenUsage
} from '../ai/clients';
import { generateInterviewPrompt, generatePrompt } from '../ai/prompts';
import { combineOCRResults, extractTextFromImages, isConfidenceAcceptable, OCRResult } from '../ocr';
import type { AppStore } from '../store';
import { imageToBase64 } from '../utils/files';
import { getMainWindow } from '../window';
import { buildDocContextPrefix } from './documents';
import { overlayManager } from './overlay';
import { getScreenshotQueue } from './screenshots';

const { createPartFromUri } = require('@google/genai');

// State for latest AI response
let latestAIResponse: string = '';

export const getLatestAIResponse = () => latestAIResponse;
export const setLatestAIResponse = (response: string) => { latestAIResponse = response; };

type StreamProvider = 'openai' | 'gemini' | 'claude' | 'zai' | 'lmstudio';

/**
 * Build an `onDelta` callback that streams token chunks back to the renderer
 * over the one-way `ai-stream` channel, tagged with the originating request and
 * provider so the renderer can route each chunk to the correct panel. Returns a
 * no-op when no `requestId` was supplied (caller opted out of streaming), so the
 * same handler code works for both streamed and non-streamed paths.
 */
const makeStreamEmitter = (
  event: IpcMainInvokeEvent,
  requestId: string | undefined,
  provider: StreamProvider
): ((delta: string) => void) => {
  if (!requestId) return () => {};
  return (delta: string) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('ai-stream', { requestId, provider, delta });
    }
  };
};

/**
 * Parse the `defaultModel` preference (JSON array or legacy alias) into the
 * ordered list of providers the user enabled in Settings.
 */
function getEnabledProviders(store: AppStore): StreamProvider[] {
  const raw = store.get('defaultModel') || 'both';
  try {
    const parsed = JSON.parse(raw as string);
    if (Array.isArray(parsed)) return parsed.filter(Boolean) as StreamProvider[];
  } catch {
    // legacy string aliases
  }
  const legacy: Record<string, StreamProvider[]> = {
    both: ['openai', 'gemini'],
    all: ['openai', 'gemini', 'zai'],
    openai: ['openai'],
    gemini: ['gemini'],
    zai: ['zai'],
    claude: ['claude'],
    lmstudio: ['lmstudio'],
  };
  return legacy[raw as string] || ['openai', 'gemini'];
}

/** Whether a provider is usable right now (has a key / is enabled). */
function isProviderReady(provider: StreamProvider, store: AppStore): boolean {
  if (provider === 'lmstudio') return !!store.get('lmstudioEnabled');
  return !!getApiKey(provider, store, { info() {}, warn() {} });
}

/**
 * Interview mode answers with ONE provider for speed. 'auto' picks the first
 * enabled provider that is actually configured; an explicit choice is used
 * as-is (its own error surfaces if it's not configured).
 */
function resolveInterviewProvider(requested: string, store: AppStore): StreamProvider {
  if (requested && requested !== 'auto') return requested as StreamProvider;
  const candidates: StreamProvider[] = [
    ...getEnabledProviders(store),
    'openai', 'gemini', 'claude', 'zai', 'lmstudio',
  ];
  const ready = candidates.find(p => isProviderReady(p, store));
  if (!ready) {
    throw new Error('No AI provider is configured. Add an API key in Settings → Models.');
  }
  return ready;
}

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

  // Token usage IPC handlers
  ipcMain.handle('getAccumulatedTokenUsage', () => {
    return store.get('accumulatedTokenUsage') || {};
  });

  ipcMain.handle('resetAccumulatedTokenUsage', () => {
    store.set('accumulatedTokenUsage', {});
    try {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('token-usage-updated', {
          provider: 'all',
          model: 'all',
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
          cumulative: {}
        });
      }
    } catch (err) {
      log.error('Failed to notify renderer of token usage reset:', err);
    }
    return { success: true };
  });

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
  ipcMain.handle('sendPromptToGemini', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    try {
      log.info('Sending request to Google Gemini API');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);

      const assistantReply = requestId
        ? await streamPromptToGemini([finalPrompt], store, makeStreamEmitter(event, requestId, 'gemini'))
        : (await sendPromptToGemini([finalPrompt], store)).text || 'No response from Google Gemini.';
      handleAIResponse(assistantReply);

      log.info('Received response from Google Gemini API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Google Gemini:', error);
      throw new Error(`Failed to fetch from Google Gemini: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendPromptToOpenAI', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    try {
      log.info('Sending request to OpenAI API');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToOpenAI(finalPrompt, store, makeStreamEmitter(event, requestId, 'openai'))
        : await sendPromptToOpenAI(finalPrompt, store);

      handleAIResponse(assistantReply);

      log.info('Received response from OpenAI API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from OpenAI:', error);
      throw new Error(`Failed to fetch from OpenAI: ${(error as Error).message}`);
    }
  });

  // Conversation-aware prompts (with history)
  ipcMain.handle('sendConversationToOpenAI', async (event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>, requestId?: string) => {
    try {
      log.info('Sending conversation request to OpenAI API');
      const assistantReply = requestId
        ? await streamConversationToOpenAI(messages, store, makeStreamEmitter(event, requestId, 'openai'))
        : await sendConversationToOpenAI(messages, store);

      handleAIResponse(assistantReply);

      log.info('Received conversation response from OpenAI API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch conversation from OpenAI:', error);
      throw new Error(`Failed to fetch conversation from OpenAI: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendConversationToGemini', async (event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>, requestId?: string) => {
    try {
      log.info('Sending conversation request to Gemini API');
      const assistantReply = requestId
        ? await streamConversationToGemini(messages, store, makeStreamEmitter(event, requestId, 'gemini'))
        : await sendConversationToGemini(messages, store);

      handleAIResponse(assistantReply);

      log.info('Received conversation response from Gemini API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch conversation from Gemini:', error);
      throw new Error(`Failed to fetch conversation from Gemini: ${(error as Error).message}`);
    }
  });

  // LM Studio handlers
  ipcMain.handle('sendPromptToLMStudio', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    try {
      log.info('Sending request to LM Studio');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToLMStudio(finalPrompt, store, makeStreamEmitter(event, requestId, 'lmstudio'))
        : await sendPromptToLMStudio(finalPrompt, store);

      handleAIResponse(assistantReply);

      log.info('Received response from LM Studio');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from LM Studio:', error);
      throw new Error(`Failed to fetch from LM Studio: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendConversationToLMStudio', async (event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>, requestId?: string) => {
    try {
      log.info('Sending conversation request to LM Studio');
      const assistantReply = requestId
        ? await streamConversationToLMStudio(messages, store, makeStreamEmitter(event, requestId, 'lmstudio'))
        : await sendConversationToLMStudio(messages, store);

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

  // Z.AI handlers
  ipcMain.handle('sendPromptToZAI', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    try {
      log.info('Sending request to Z.AI');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToZAI(finalPrompt, store, makeStreamEmitter(event, requestId, 'zai'))
        : await sendPromptToZAI(finalPrompt, store);

      handleAIResponse(assistantReply);

      log.info('Received response from Z.AI');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Z.AI:', error);
      throw new Error(`Failed to fetch from Z.AI: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendConversationToZAI', async (event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>, requestId?: string) => {
    try {
      log.info('Sending conversation request to Z.AI');
      const assistantReply = requestId
        ? await streamConversationToZAI(messages, store, makeStreamEmitter(event, requestId, 'zai'))
        : await sendConversationToZAI(messages, store);

      handleAIResponse(assistantReply);

      log.info('Received conversation response from Z.AI');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch conversation from Z.AI:', error);
      throw new Error(`Failed to fetch conversation from Z.AI: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('testZAIConnection', async () => {
    try {
      log.info('Testing Z.AI connection');
      const result = await testZAIConnection(store);
      log.info('Z.AI connection test result:', result);
      return result;
    } catch (error) {
      log.error('Z.AI connection test failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('testOpenAIConnection', async () => {
    try {
      log.info('Testing OpenAI connection');
      const result = await testOpenAIConnection(store);
      log.info('OpenAI connection test result:', result);
      return result;
    } catch (error) {
      log.error('OpenAI connection test failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('testGeminiConnection', async () => {
    try {
      log.info('Testing Gemini connection');
      const result = await testGeminiConnection(store);
      log.info('Gemini connection test result:', result);
      return result;
    } catch (error) {
      log.error('Gemini connection test failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Claude handlers
  ipcMain.handle('sendPromptToClaude', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    try {
      log.info('Sending request to Anthropic Claude API');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToClaude(finalPrompt, store, makeStreamEmitter(event, requestId, 'claude'))
        : await sendPromptToClaude(finalPrompt, store);
      
      handleAIResponse(assistantReply);

      log.info('Received response from Anthropic Claude API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Claude:', error);
      throw new Error(`Failed to fetch from Claude: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendConversationToClaude', async (event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>, requestId?: string) => {
    try {
      log.info('Sending conversation request to Claude API');
      const assistantReply = requestId
        ? await streamConversationToClaude(messages, store, makeStreamEmitter(event, requestId, 'claude'))
        : await sendConversationToClaude(messages, store);
      
      handleAIResponse(assistantReply);

      log.info('Received conversation response from Claude API');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch conversation from Claude:', error);
      throw new Error(`Failed to fetch conversation from Claude: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('testClaudeConnection', async () => {
    try {
      log.info('Testing Claude connection');
      const result = await testClaudeConnection(store);
      log.info('Claude connection test result:', result);
      return result;
    } catch (error) {
      log.error('Claude connection test failed:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Interview mode: one provider, streamed, spoken-style answer to a live
  // transcribed question. `history` carries prior Q/A turns (raw text) so
  // follow-up questions keep context; the instruction prompt is only applied
  // to the newest turn to keep token usage low.
  ipcMain.handle('sendInterviewPrompt', async (
    event: IpcMainInvokeEvent,
    args: {
      provider: string;
      question: string;
      history?: Array<{ role: 'user' | 'assistant'; content: string }>;
      answerLanguage?: 'auto' | 'en' | 'vi';
      requestId?: string;
    }
  ) => {
    try {
      const question = (args?.question || '').trim();
      if (!question) {
        return { success: false, error: 'Empty question' };
      }
      const provider = resolveInterviewProvider(args.provider, store);
      const answerLanguage = args.answerLanguage || 'auto';
      const codeLanguage = store.get('preferredLanguage') || 'python';
      const docPrefix = buildDocContextPrefix();
      const finalPrompt = generateInterviewPrompt(question, answerLanguage, codeLanguage, docPrefix);

      const history = Array.isArray(args.history) ? args.history : [];
      const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: finalPrompt },
      ];

      const onDelta = makeStreamEmitter(event, args.requestId, provider);
      const stream = !!args.requestId;
      log.info(`Interview: asking ${provider} (lang=${answerLanguage}, history=${history.length})`);

      let reply = '';
      switch (provider) {
        case 'openai':
          reply = stream ? await streamConversationToOpenAI(messages, store, onDelta) : await sendConversationToOpenAI(messages, store);
          break;
        case 'gemini':
          reply = stream ? await streamConversationToGemini(messages, store, onDelta) : await sendConversationToGemini(messages, store);
          break;
        case 'claude':
          reply = stream ? await streamConversationToClaude(messages, store, onDelta) : await sendConversationToClaude(messages, store);
          break;
        case 'zai':
          reply = stream ? await streamConversationToZAI(messages, store, onDelta) : await sendConversationToZAI(messages, store);
          break;
        case 'lmstudio':
          reply = stream ? await streamConversationToLMStudio(messages, store, onDelta) : await sendConversationToLMStudio(messages, store);
          break;
        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }

      // Keep Ctrl+Shift+C (copy latest answer) working, but don't pop the exam
      // overlay bubble — interview mode shows the answer in its own panel.
      latestAIResponse = reply;
      overlayManager.setLatestResponse(reply);

      return { success: true, data: { reply, provider } };
    } catch (error) {
      log.error('Interview prompt failed:', error);
      return { success: false, error: (error as Error).message || 'Interview request failed' };
    }
  });

  // Prompt with screenshots
  ipcMain.handle('sendPromptWithScreenshotsToOpenAI', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    const onDelta = makeStreamEmitter(event, requestId, 'openai');
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      // No screenshots queued — fall back to a plain text prompt. (We can't
      // re-dispatch the other IPC handler via ipcMain.emit: invoke handlers are
      // not EventEmitter listeners, so emit would not return the AI response.)
      log.info('No screenshots queued; sending text-only prompt to OpenAI');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToOpenAI(finalPrompt, store, onDelta)
        : await sendPromptToOpenAI(finalPrompt, store);
      handleAIResponse(assistantReply);
      return assistantReply;
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

      const model = getCurrentOpenAIModel(store);
      const messages = [{ role: 'user', content }];
      let assistantReply = '';
      if (requestId) {
        assistantReply = (await streamChatCompletion(openai, model, messages, onDelta, store, 'openai')) || 'No response from OpenAI.';
      } else {
        const response = await openai.chat.completions.create({ model, messages: messages as any });
        assistantReply = response.choices[0]?.message?.content || 'No response from OpenAI.';
        if (response.usage) {
          recordTokenUsage(
            store,
            'openai',
            model,
            response.usage.prompt_tokens || 0,
            response.usage.completion_tokens || 0
          );
        }
      }
      handleAIResponse(assistantReply);

      log.info('Received response from OpenAI API with screenshots');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from OpenAI with screenshots:', error);
      throw new Error(`Failed to fetch from OpenAI: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('sendPromptWithScreenshotsToGemini', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    const onDelta = makeStreamEmitter(event, requestId, 'gemini');
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      // No screenshots queued — fall back to a plain text prompt. (ipcMain.emit
      // can't reach an invoke handler, so build and run the request directly.)
      log.info('No screenshots queued; sending text-only prompt to Gemini');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToGemini([finalPrompt], store, onDelta)
        : (await sendPromptToGemini([finalPrompt], store)).text || 'No response from Gemini.';
      handleAIResponse(assistantReply);
      return assistantReply;
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

      const assistantReply = requestId
        ? await streamPromptToGemini(parts, store, onDelta)
        : (await sendPromptToGemini(parts, store)).text || 'No response from Gemini.';

      handleAIResponse(assistantReply);

      log.info('Received response from Gemini API with screenshots');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Gemini with screenshots:', error);
      throw new Error(`Failed to fetch from Gemini: ${(error as Error).message}`);
    }
  });

  // Claude with screenshots (vision-capable)
  ipcMain.handle('sendPromptWithScreenshotsToClaude', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      log.info('No screenshots queued; sending text-only prompt to Claude');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToClaude(finalPrompt, store, makeStreamEmitter(event, requestId, 'claude'))
        : await sendPromptToClaude(finalPrompt, store);
      handleAIResponse(assistantReply);
      return assistantReply;
    }

    try {
      log.info('Sending prompt with screenshots to Claude API');
      const screenshots = [...screenshotQueue];
      const docPrefix = buildDocContextPrefix();
      
      // Process OCR if enabled
      const { ocrResult, shouldIncludeImages } = await processScreenshotsWithOCR(screenshots, store, log);
      const ocrPrefix = buildOCRContextPrefix(ocrResult, log);
      
      const finalPrompt = `${docPrefix ? docPrefix + '\n\n' : ''}${ocrPrefix}${prompt}`;

      let assistantReply: string;
      if (shouldIncludeImages) {
        assistantReply = requestId
          ? await streamPromptWithScreenshotsToClaude(finalPrompt, screenshots, store, makeStreamEmitter(event, requestId, 'claude'))
          : await sendPromptWithScreenshotsToClaude(finalPrompt, screenshots, store);
      } else {
        assistantReply = requestId
          ? await streamPromptToClaude(finalPrompt, store, makeStreamEmitter(event, requestId, 'claude'))
          : await sendPromptToClaude(finalPrompt, store);
      }
      handleAIResponse(assistantReply);

      log.info('Received response from Claude API with screenshots');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Claude with screenshots:', error);
      throw new Error(`Failed to fetch from Claude: ${(error as Error).message}`);
    }
  });

  // Z.AI with screenshots (vision-capable)
  ipcMain.handle('sendPromptWithScreenshotsToZAI', async (event: IpcMainInvokeEvent, prompt: string, requestId?: string) => {
    const onDelta = makeStreamEmitter(event, requestId, 'zai');
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      // No screenshots queued — fall back to a plain text prompt. (ipcMain.emit
      // can't reach an invoke handler, so build and run the request directly.)
      log.info('No screenshots queued; sending text-only prompt to Z.AI');
      const docPrefix = buildDocContextPrefix();
      const answerStyle = store.get('answerStyle') || 'explanation';
      const language = store.get('preferredLanguage') || 'python';
      const finalPrompt = generatePrompt(answerStyle, language, prompt, docPrefix);
      const assistantReply = requestId
        ? await streamPromptToZAI(finalPrompt, store, onDelta)
        : await sendPromptToZAI(finalPrompt, store);
      handleAIResponse(assistantReply);
      return assistantReply;
    }

    try {
      log.info('Sending prompt with screenshots to Z.AI API');
      const zaiApiKey = store.get('zaiApiKey');
      if (!zaiApiKey) {
        throw new Error('Z.AI API key is not configured');
      }

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

      // Use Z.AI vision model
      const { OpenAI } = require('openai');
      const zaiClient = new OpenAI({
        apiKey: zaiApiKey,
        baseURL: 'https://api.z.ai/api/paas/v4/',
      });

      const zaiModel = store.get('zaiModel') || 'GLM-4.6V-Flash';
      const messages = [{ role: 'user', content }];

      let assistantReply = '';
      if (requestId) {
        assistantReply = (await streamChatCompletion(zaiClient, zaiModel, messages, onDelta, store, 'zai')) || 'No response from Z.AI.';
      } else {
        const response = await zaiClient.chat.completions.create({ model: zaiModel, messages });
        assistantReply = response.choices[0]?.message?.content || 'No response from Z.AI.';
        if (response.usage) {
          recordTokenUsage(
            store,
            'zai',
            zaiModel,
            response.usage.prompt_tokens || 0,
            response.usage.completion_tokens || 0
          );
        }
      }
      handleAIResponse(assistantReply);

      log.info('Received response from Z.AI API with screenshots');
      return assistantReply;
    } catch (error) {
      log.error('Failed to fetch from Z.AI with screenshots:', error);
      throw new Error(`Failed to fetch from Z.AI: ${(error as Error).message}`);
    }
  });

  // Screenshot Analysis
  const analyzeScreenshotsWithGemini = async (options: { language?: string }, onDelta?: (d: string) => void) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available to analyze' };
    }

    try {
      const ai = getGeminiClient(store);
      const screenshots = [...screenshotQueue];
      const language = options.language || store.get('preferredLanguage') || 'python';
      const answerStyle = store.get('answerStyle', 'explanation');
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

      const analysis = (onDelta
        ? await streamPromptToGemini(parts, store, onDelta)
        : (await sendPromptToGemini(parts, store)).text) || 'Analysis completed, but no specific solution was generated.';

      handleAIResponse(analysis);

      return { success: true, analysis, screenshots };
    } catch (error) {
      log.error('Error analyzing screenshots with Gemini:', error);
      return { success: false, error: (error as Error).message };
    }
  };

  const analyzeScreenshotsWithOpenAI = async (options: { language?: string }, onDelta?: (d: string) => void) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available to analyze' };
    }

    try {
      const openai = getOpenAIClient(store);
      const screenshots = [...screenshotQueue];
      const language = options.language || store.get('preferredLanguage') || 'python';
      const answerStyle = store.get('answerStyle') || 'explanation';
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

      const model = getCurrentOpenAIModel(store);
      const messages = [{ role: 'user', content }];
      let analysis = '';
      if (onDelta) {
        analysis = (await streamChatCompletion(openai, model, messages, onDelta, store, 'openai')) || 'Analysis completed, but no specific solution was generated.';
      } else {
        const response = await openai.chat.completions.create({ model, messages: messages as any });
        analysis = response.choices[0]?.message?.content || 'Analysis completed, but no specific solution was generated.';
        if (response.usage) {
          recordTokenUsage(
            store,
            'openai',
            model,
            response.usage.prompt_tokens || 0,
            response.usage.completion_tokens || 0
          );
        }
      }
      handleAIResponse(analysis);

      return { success: true, analysis, screenshots };
    } catch (error) {
      log.error('Error analyzing screenshots with OpenAI:', error);
      return { success: false, error: (error as Error).message };
    }
  };

  // Z.AI Screenshot Analysis (uses OpenAI-compatible vision API)
  const analyzeScreenshotsWithZAI = async (options: { language?: string }, onDelta?: (d: string) => void) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available to analyze' };
    }

    try {
      const zaiApiKey = store.get('zaiApiKey');
      if (!zaiApiKey) {
        return { success: false, error: 'Z.AI API key is not configured' };
      }

      const screenshots = [...screenshotQueue];
      const language = options.language || store.get('preferredLanguage') || 'python';
      const answerStyle = store.get('answerStyle') || 'explanation';
      const docPrefix = buildDocContextPrefix();
      
      // Process OCR if enabled
      const { ocrResult, shouldIncludeImages } = await processScreenshotsWithOCR(screenshots, store, log);
      const ocrPrefix = buildOCRContextPrefix(ocrResult, log);
      
      const promptText = generatePrompt(answerStyle, language, undefined, docPrefix ? `${docPrefix}\n\n${ocrPrefix}` : ocrPrefix);

      // Build content with images for Z.AI vision model
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

      // Use Z.AI vision model (GLM-4.6V-Flash for vision tasks)
      const { OpenAI } = require('openai');
      const zaiClient = new OpenAI({
        apiKey: zaiApiKey,
        baseURL: 'https://api.z.ai/api/paas/v4/',
      });

      // Use vision-capable model for image analysis
      const zaiModel = store.get('zaiModel') || 'GLM-4.6V-Flash';
      const messages = [{ role: 'user', content }];

      let analysis = '';
      if (onDelta) {
        analysis = (await streamChatCompletion(zaiClient, zaiModel, messages, onDelta, store, 'zai')) || 'Analysis completed, but no specific solution was generated.';
      } else {
        const response = await zaiClient.chat.completions.create({ model: zaiModel, messages });
        analysis = response.choices[0]?.message?.content || 'Analysis completed, but no specific solution was generated.';
        if (response.usage) {
          recordTokenUsage(
            store,
            'zai',
            zaiModel,
            response.usage.prompt_tokens || 0,
            response.usage.completion_tokens || 0
          );
        }
      }
      handleAIResponse(analysis);

      return { success: true, analysis, screenshots };
    } catch (error) {
      log.error('Error analyzing screenshots with Z.AI:', error);
      return { success: false, error: (error as Error).message };
    }
  };

  const analyzeScreenshotsWithClaude = async (options: { language?: string }) => {
    const screenshotQueue = getScreenshotQueue();
    if (screenshotQueue.length === 0) {
      return { success: false, error: 'No screenshots available to analyze' };
    }

    try {
      const screenshots = [...screenshotQueue];
      const language = options.language || store.get('preferredLanguage') || 'python';
      const answerStyle = store.get('answerStyle') || 'explanation';
      const docPrefix = buildDocContextPrefix();
      
      // Process OCR if enabled
      const { ocrResult, shouldIncludeImages } = await processScreenshotsWithOCR(screenshots, store, log);
      const ocrPrefix = buildOCRContextPrefix(ocrResult, log);
      
      const promptText = generatePrompt(answerStyle, language, undefined, docPrefix ? `${docPrefix}\n\n${ocrPrefix}` : ocrPrefix);

      let analysis: string;
      if (shouldIncludeImages) {
        analysis = await sendPromptWithScreenshotsToClaude(promptText, screenshots, store);
      } else {
        analysis = await sendPromptToClaude(promptText, store);
      }
      handleAIResponse(analysis);

      return { success: true, analysis, screenshots };
    } catch (error) {
      log.error('Error analyzing screenshots with Claude:', error);
      return { success: false, error: (error as Error).message };
    }
  };

  ipcMain.handle('analyze-screenshots', async (event: IpcMainInvokeEvent, options: { language?: string; requestId?: string }) =>
    analyzeScreenshotsWithGemini(options, options?.requestId ? makeStreamEmitter(event, options.requestId, 'gemini') : undefined));
  ipcMain.handle('analyzeScreenshotsWithGemini', async (event: IpcMainInvokeEvent, options: { language?: string; requestId?: string }) =>
    analyzeScreenshotsWithGemini(options, options?.requestId ? makeStreamEmitter(event, options.requestId, 'gemini') : undefined));
  ipcMain.handle('analyzeScreenshotsWithOpenAI', async (event: IpcMainInvokeEvent, options: { language?: string; requestId?: string }) =>
    analyzeScreenshotsWithOpenAI(options, options?.requestId ? makeStreamEmitter(event, options.requestId, 'openai') : undefined));
  ipcMain.handle('analyzeScreenshotsWithZAI', async (event: IpcMainInvokeEvent, options: { language?: string; requestId?: string }) =>
    analyzeScreenshotsWithZAI(options, options?.requestId ? makeStreamEmitter(event, options.requestId, 'zai') : undefined));
  ipcMain.handle('analyzeScreenshotsWithClaude', async (_event, options: { language?: string }) => 
    analyzeScreenshotsWithClaude(options));

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

    const model = getCurrentOpenAIModel(store);
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content }],
    });

    if (response.usage) {
      recordTokenUsage(
        store,
        'openai',
        model,
        response.usage.prompt_tokens || 0,
        response.usage.completion_tokens || 0
      );
    }

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
      const isLmstudioMode = defaultModel === 'lmstudio';
      const ocrEnabled = store.get('ocrEnabled', false) || (isLmstudioMode && lmstudioEnabled);
      
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

      // Parse enabled providers (supports both new JSON array format and legacy format)
      let openaiEnabled = false;
      let geminiEnabled = false;
      let lmstudioMode = false;
      let zaiEnabled = false;
      let claudeEnabled = false;

      try {
        const providers = JSON.parse(defaultModel as string);
        if (Array.isArray(providers)) {
          openaiEnabled = providers.includes('openai');
          geminiEnabled = providers.includes('gemini');
          zaiEnabled = providers.includes('zai');
          claudeEnabled = providers.includes('claude');
        }
      } catch {
        // Legacy format
        switch (defaultModel) {
          case 'both':
            openaiEnabled = true;
            geminiEnabled = true;
            break;
          case 'openai':
            openaiEnabled = true;
            break;
          case 'gemini':
            geminiEnabled = true;
            break;
          case 'lmstudio':
            lmstudioMode = true;
            break;
          case 'zai':
            zaiEnabled = true;
            break;
          case 'claude':
            claudeEnabled = true;
            break;
          default:
            openaiEnabled = true;
            geminiEnabled = true;
        }
      }

      const promises = [];
      let openaiResponse = '';
      let geminiResponse = '';
      let lmstudioResponse = '';
      let zaiResponse = '';
      let claudeResponse = '';
      
      if (openaiEnabled && !lmstudioMode) {
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
      
      if (geminiEnabled && !lmstudioMode) {
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
      if (lmstudioMode) {
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

      // Z.AI
      if (zaiEnabled && !lmstudioMode) {
        promises.push(
          sendPromptToZAI(promptText, store)
            .then(response => {
              zaiResponse = response;
              handleAIResponse(response);
              return response;
            })
            .catch((error: Error) => {
              zaiResponse = `Z.AI Error: ${error.message}`;
              return zaiResponse;
            })
        );
      }

      // Claude
      if (claudeEnabled && !lmstudioMode) {
        promises.push(
          sendPromptToClaude(promptText, store)
            .then(response => {
              claudeResponse = response;
              handleAIResponse(response);
              return response;
            })
            .catch((error: Error) => {
              claudeResponse = `Claude Error: ${error.message}`;
              return claudeResponse;
            })
        );
      }

      await Promise.allSettled(promises);
      const finalResponse = latestAIResponse || openaiResponse || geminiResponse || claudeResponse || lmstudioResponse || zaiResponse || 'No response received';

      if (finalResponse && finalResponse !== 'No response received') {
        clipboard.writeText(finalResponse);
      }

      return {
        success: true,
        prompt: clipboardText,
        openaiResponse,
        geminiResponse,
        claudeResponse,
        lmstudioResponse,
        zaiResponse
      };
    } catch (error) {
      log.error('Error processing clipboard prompt via IPC:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}
