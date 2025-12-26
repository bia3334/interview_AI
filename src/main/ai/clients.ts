import { OpenAI } from 'openai';
const { GoogleGenAI } = require('@google/genai');

// AI Models Configuration
export const AI_CONFIG = {
  default: 'openai', // Default AI provider
  gemini: {
    model: "gemini-2.5-flash"
  },
  openai: {
    model: "gpt-5.1"
  }
};

// API Key Management
export const getApiKey = (type: 'openai' | 'gemini', store: any, log: any) => {
  const keys = {
    openai: store.get('openaiApiKey') || store.get('apiKey') || process.env.OPENAI_API_KEY || '',
    gemini: store.get('geminiApiKey') || process.env.GEMINI_API_KEY || ''
  };
  
  const key = keys[type];
  if (key) {
    log.info(`${type.toUpperCase()} API key found`);
  } else {
    log.warn(`No ${type.toUpperCase()} API key found`);
  }
  return key;
};

// AI Client Management
export const getOpenAIClient = (store: any) => {
  const apiKey = getApiKey('openai', store, console);
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey });
};

export const getGeminiClient = (store: any) => {
  const apiKey = getApiKey('gemini', store, console);
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }
  return new GoogleGenAI({ apiKey });
};

// Model Management
export const getCurrentOpenAIModel = (store: any) => 
  store.get('openaiModel') || AI_CONFIG.openai.model;

export const getCurrentGeminiModel = (store: any) => 
  store.get('geminiModel') || AI_CONFIG.gemini.model;

// AI Request Functions
export const sendPromptToGemini = (prompt: string[], store: any) => {
  const ai = getGeminiClient(store);
  const { createUserContent } = require('@google/genai');
  return ai.models.generateContent({
    model: getCurrentGeminiModel(store),
    contents: [createUserContent(prompt)],
  });
};

export const sendPromptToOpenAI = async (prompt: string, store: any) => {
  const openai = getOpenAIClient(store);
  const response = await openai.chat.completions.create({
    model: getCurrentOpenAIModel(store),
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0]?.message?.content || '';
};

// Conversation-aware prompt (with history)
export const sendConversationToOpenAI = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
) => {
  const openai = getOpenAIClient(store);
  const response = await openai.chat.completions.create({
    model: getCurrentOpenAIModel(store),
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  });
  return response.choices[0]?.message?.content || '';
};

export const sendConversationToGemini = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
) => {
  const ai = getGeminiClient(store);
  // Convert messages to Gemini format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  
  const response = await ai.models.generateContent({
    model: getCurrentGeminiModel(store),
    contents: contents,
  });
  
  return response.text || '';
};
