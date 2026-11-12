import { ChatMessage, ConnectionTestResult, OnDelta, AI_CONFIG, getApiKey, getCustomSystemPrompt, logRequest } from '../settings';
import { recordTokenUsage } from '../usage';

const { GoogleGenAI, createUserContent } = require('@google/genai');

export const getGeminiClient = (store: any) => {
  const apiKey = getApiKey('gemini', store, console);
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }
  return new GoogleGenAI({ apiKey });
};

export const getCurrentGeminiModel = (store: any): string =>
  store.get('geminiModel') || AI_CONFIG.gemini.model;

/** Gemini calls the assistant role 'model'. */
const toContents = (messages: ChatMessage[]) =>
  messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

const buildRequest = (store: any, contents: any[]) => {
  const systemPrompt = getCustomSystemPrompt(store);
  return {
    model: getCurrentGeminiModel(store),
    contents,
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
  };
};

const recordUsage = (store: any, model: string, usage: any) => {
  if (!usage) return;
  recordTokenUsage(store, 'gemini', model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
};

const generate = async (store: any, contents: any[]) => {
  const request = buildRequest(store, contents);
  const response = await getGeminiClient(store).models.generateContent(request);
  recordUsage(store, request.model, response?.usageMetadata);
  return response;
};

const stream = async (store: any, contents: any[], onDelta: OnDelta): Promise<string> => {
  const request = buildRequest(store, contents);
  const chunks = await getGeminiClient(store).models.generateContentStream(request);

  let full = '';
  for await (const chunk of chunks) {
    const text = chunk.text || '';
    if (text) {
      full += text;
      onDelta(text);
    }
    recordUsage(store, request.model, chunk.usageMetadata);
  }
  return full;
};

/** `parts` is plain text and/or createPartFromUri image parts. Resolves with the raw response. */
export const sendPromptToGemini = (parts: any[], store: any) => {
  logRequest('GEMINI PROMPT', {
    Model: getCurrentGeminiModel(store),
    'System Prompt': getCustomSystemPrompt(store) || '(none)',
    'User Prompt': parts,
  });
  return generate(store, [createUserContent(parts)]);
};

export const sendConversationToGemini = async (messages: ChatMessage[], store: any): Promise<string> => {
  const response = await generate(store, toContents(messages));
  return response.text || '';
};

export const streamPromptToGemini = (parts: any[], store: any, onDelta: OnDelta) =>
  stream(store, [createUserContent(parts)], onDelta);

export const streamConversationToGemini = (messages: ChatMessage[], store: any, onDelta: OnDelta) =>
  stream(store, toContents(messages), onDelta);

export const testGeminiConnection = async (store: any): Promise<ConnectionTestResult> => {
  try {
    const model = getCurrentGeminiModel(store);
    await getGeminiClient(store).models.generateContent({
      model,
      contents: toContents([{ role: 'user', content: 'Hi' }]),
    });
    return { success: true, model };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
};
