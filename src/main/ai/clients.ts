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

// Get custom system prompt
export const getCustomSystemPrompt = (store: any): string => {
  return store.get('customSystemPrompt') || '';
};

// AI Request Functions
export const sendPromptToGemini = (prompt: string[], store: any) => {
  const ai = getGeminiClient(store);
  const { createUserContent } = require('@google/genai');
  const systemPrompt = getCustomSystemPrompt(store);
  
  // Prepend system prompt to the user prompt if it exists
  const finalPrompt = systemPrompt 
    ? [`[System Instructions]: ${systemPrompt}\n\n`, ...prompt]
    : prompt;
  
  return ai.models.generateContent({
    model: getCurrentGeminiModel(store),
    contents: [createUserContent(finalPrompt)],
  });
};

export const sendPromptToOpenAI = async (prompt: string, store: any) => {
  const openai = getOpenAIClient(store);
  const systemPrompt = getCustomSystemPrompt(store);
  
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  
  // Add system message if custom prompt exists
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });
  
  const response = await openai.chat.completions.create({
    model: getCurrentOpenAIModel(store),
    messages: messages,
  });
  return response.choices[0]?.message?.content || '';
};

// Conversation-aware prompt (with history)
export const sendConversationToOpenAI = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
) => {
  const openai = getOpenAIClient(store);
  const systemPrompt = getCustomSystemPrompt(store);
  
  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  
  // Add system message if custom prompt exists
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }
  
  // Add conversation messages
  apiMessages.push(...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));
  
  const response = await openai.chat.completions.create({
    model: getCurrentOpenAIModel(store),
    messages: apiMessages,
  });
  return response.choices[0]?.message?.content || '';
};

export const sendConversationToGemini = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
) => {
  const ai = getGeminiClient(store);
  const systemPrompt = getCustomSystemPrompt(store);
  
  // Convert messages to Gemini format
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  
  // If there's a system prompt, prepend it to the first user message
  if (systemPrompt && contents.length > 0 && contents[0].role === 'user') {
    contents[0].parts[0].text = `[System Instructions]: ${systemPrompt}\n\n${contents[0].parts[0].text}`;
  }
  
  const response = await ai.models.generateContent({
    model: getCurrentGeminiModel(store),
    contents: contents,
  });
  
  return response.text || '';
};

// Extract key information from document content
export const extractKeyInfoFromDocument = async (
  content: string,
  fileName: string,
  store: any
): Promise<string> => {
  const { generateKeyInfoExtractionPrompt } = require('./prompts');
  const prompt = generateKeyInfoExtractionPrompt(fileName, content);
  
  // Use the model based on user's selection (defaultModel setting)
  const defaultModel = store.get('defaultModel') || 'both';
  const useOpenAI = defaultModel === 'openai' || defaultModel === 'both';
  const useGemini = defaultModel === 'gemini';
  
  if (useOpenAI) {
    // Use OpenAI (selected or default for 'both')
    try {
      const openai = getOpenAIClient(store);
      const response = await openai.chat.completions.create({
        model: getCurrentOpenAIModel(store),
        messages: [
          { role: 'system', content: 'You are a document analyzer. Extract key information accurately and comprehensively.' },
          { role: 'user', content: prompt }
        ],
      });
      return response.choices[0]?.message?.content || '';
    } catch (openaiError) {
      console.error('OpenAI extraction failed:', openaiError);
      throw new Error('Failed to extract key information using OpenAI');
    }
  } else if (useGemini) {
    // Use Gemini (explicitly selected)
    try {
      const ai = getGeminiClient(store);
      const response = await ai.models.generateContent({
        model: getCurrentGeminiModel(store),
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      return response.text || '';
    } catch (geminiError) {
      console.error('Gemini extraction failed:', geminiError);
      throw new Error('Failed to extract key information using Gemini');
    }
  }
  
  throw new Error('No AI model configured for key information extraction');
};
