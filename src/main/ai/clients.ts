import { OpenAI } from 'openai';
const { GoogleGenAI } = require('@google/genai');
import { AI_MODELS, DEFAULT_AI_PROVIDER, LMSTUDIO_CONFIG, ZAI_CONFIG, OPENAI_COMPATIBLE_PROVIDERS, OpenAICompatibleProvider } from '../constants/ai';

// AI Models Configuration
export const AI_CONFIG = {
  default: DEFAULT_AI_PROVIDER,
  gemini: {
    model: AI_MODELS.gemini.default
  },
  openai: {
    model: AI_MODELS.openai.default
  },
  lmstudio: {
    endpoint: LMSTUDIO_CONFIG.DEFAULT_ENDPOINT,
    model: LMSTUDIO_CONFIG.DEFAULT_MODEL
  },
  zai: {
    baseUrl: ZAI_CONFIG.BASE_URL,
    model: ZAI_CONFIG.DEFAULT_MODEL
  }
};

// API Key Management
export const getApiKey = (type: 'openai' | 'gemini' | 'zai', store: any, log: any) => {
  const keys = {
    openai: store.get('openaiApiKey') || store.get('apiKey') || process.env.OPENAI_API_KEY || '',
    gemini: store.get('geminiApiKey') || process.env.GEMINI_API_KEY || '',
    zai: store.get('zaiApiKey') || process.env.ZAI_API_KEY || ''
  };
  
  const key = keys[type];
  if (key) {
    log.info(`${type.toUpperCase()} API key found`);
  } else {
    log.warn(`No ${type.toUpperCase()} API key found`);
  }
  return key;
};

// ============================================================
// UNIFIED OpenAI-Compatible Client
// Works with OpenAI, Z.AI, LM Studio, and any OpenAI-compatible API
// ============================================================

export const getOpenAICompatibleClient = (providerId: string, store: any): OpenAI => {
  const provider = OPENAI_COMPATIBLE_PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  // Get API key (or use placeholder for providers that don't need one)
  let apiKey = 'not-needed';
  if (provider.requiresApiKey) {
    apiKey = store.get(provider.apiKeyStore) || '';
    if (!apiKey) {
      throw new Error(`${provider.name} API key is not configured`);
    }
  }

  // For LM Studio, use custom endpoint from settings
  let baseURL = provider.baseURL;
  if (providerId === 'lmstudio') {
    baseURL = store.get('lmstudioEndpoint') || LMSTUDIO_CONFIG.DEFAULT_ENDPOINT;
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
};

export const getOpenAICompatibleModel = (providerId: string, store: any): string => {
  const provider = OPENAI_COMPATIBLE_PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return store.get(provider.modelStore) || provider.defaultModel;
};

// Unified send prompt for any OpenAI-compatible provider
export const sendPromptToOpenAICompatible = async (
  providerId: string,
  prompt: string,
  store: any
): Promise<string> => {
  const client = getOpenAICompatibleClient(providerId, store);
  const model = getOpenAICompatibleModel(providerId, store);
  const systemPrompt = getCustomSystemPrompt(store);

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  console.log(`\n========== ${providerId.toUpperCase()} PROMPT ==========`);
  console.log('Model:', model);
  console.log('System Prompt:', systemPrompt || '(none)');
  console.log('User Prompt:', prompt);
  console.log('==========================================\n');

  const response = await client.chat.completions.create({
    model,
    messages,
  });
  return response.choices[0]?.message?.content || '';
};

// Unified conversation for any OpenAI-compatible provider
export const sendConversationToOpenAICompatible = async (
  providerId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
): Promise<string> => {
  const client = getOpenAICompatibleClient(providerId, store);
  const model = getOpenAICompatibleModel(providerId, store);
  const systemPrompt = getCustomSystemPrompt(store);

  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }
  apiMessages.push(...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));

  console.log(`\n========== ${providerId.toUpperCase()} CONVERSATION ==========`);
  console.log('Model:', model);
  console.log('Messages:', JSON.stringify(apiMessages, null, 2));
  console.log('==============================================\n');

  const response = await client.chat.completions.create({
    model,
    messages: apiMessages,
  });
  return response.choices[0]?.message?.content || '';
};

// Test connection for any OpenAI-compatible provider
export const testOpenAICompatibleConnection = async (
  providerId: string,
  store: any
): Promise<{ success: boolean; model?: string; error?: string }> => {
  try {
    const client = getOpenAICompatibleClient(providerId, store);
    const model = getOpenAICompatibleModel(providerId, store);
    
    // Send a simple test message
    // Use max_completion_tokens for newer OpenAI models, max_tokens for others
    const tokenParam = providerId === 'openai' 
      ? { max_completion_tokens: 5 } 
      : { max_tokens: 5 };
    
    await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      ...tokenParam,
    });
    return { success: true, model };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
};

// ============================================================
// Legacy Individual Clients (for backward compatibility)
// ============================================================

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

export const getZAIClient = (store: any) => {
  return getOpenAICompatibleClient('zai', store);
};

// Model Management
export const getCurrentOpenAIModel = (store: any) => 
  store.get('openaiModel') || AI_CONFIG.openai.model;

export const getCurrentGeminiModel = (store: any) => 
  store.get('geminiModel') || AI_CONFIG.gemini.model;

export const getCurrentZAIModel = (store: any) => 
  store.get('zaiModel') || AI_CONFIG.zai.model;

// Get custom system prompt
export const getCustomSystemPrompt = (store: any): string => {
  return store.get('customSystemPrompt') || '';
};

// AI Request Functions
export const sendPromptToGemini = (prompt: string[], store: any) => {
  const ai = getGeminiClient(store);
  const { createUserContent } = require('@google/genai');
  const systemPrompt = getCustomSystemPrompt(store);

  // Build config with optional system instruction
  const config: any = {
    model: getCurrentGeminiModel(store),
    contents: [createUserContent(prompt)],
  };
  
  // Use proper systemInstruction parameter (supported in Gemini 1.5+)
  if (systemPrompt) {
    config.systemInstruction = systemPrompt;
  }

  console.log('\n========== GEMINI PROMPT ==========');
  console.log('Model:', config.model);
  console.log('System Prompt:', systemPrompt || '(none)');
  console.log('User Prompt:', prompt);
  console.log('====================================\n');

  return ai.models.generateContent(config);
};

// These now use the unified function internally
export const sendPromptToOpenAI = async (prompt: string, store: any) => {
  return sendPromptToOpenAICompatible('openai', prompt, store);
};

export const sendConversationToOpenAI = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
) => {
  return sendConversationToOpenAICompatible('openai', messages, store);
};

export const sendPromptToZAI = async (prompt: string, store: any) => {
  return sendPromptToOpenAICompatible('zai', prompt, store);
};

export const sendConversationToZAI = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
) => {
  return sendConversationToOpenAICompatible('zai', messages, store);
};

export const sendPromptToLMStudio = async (prompt: string, store: any) => {
  return sendPromptToOpenAICompatible('lmstudio', prompt, store);
};

export const sendConversationToLMStudio = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
) => {
  return sendConversationToOpenAICompatible('lmstudio', messages, store);
};

export const testZAIConnection = async (store: any) => {
  return testOpenAICompatibleConnection('zai', store);
};

export const testLMStudioConnection = async (store: any) => {
  return testOpenAICompatibleConnection('lmstudio', store);
};

export const testOpenAIConnection = async (store: any) => {
  return testOpenAICompatibleConnection('openai', store);
};

export const testGeminiConnection = async (store: any): Promise<{ success: boolean; model?: string; error?: string }> => {
  try {
    const ai = getGeminiClient(store);
    const model = getCurrentGeminiModel(store);
    
    // Send a simple test message
    await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: 'Hi' }] }],
    });
    return { success: true, model };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
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
  
  // Build config with optional system instruction
  const config: any = {
    model: getCurrentGeminiModel(store),
    contents: contents,
  };
  
  // Use proper systemInstruction parameter (supported in Gemini 1.5+)
  if (systemPrompt) {
    config.systemInstruction = systemPrompt;
  }
  
  const response = await ai.models.generateContent(config);
  
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

  // `defaultModel` may be the new JSON-array format (e.g. '["openai","gemini"]')
  // or a legacy string ('both' | 'openai' | 'gemini' | 'zai' | 'lmstudio').
  // Normalise both into a provider list so this keeps working regardless.
  const raw = store.get('defaultModel') || 'both';
  let providers: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) providers = parsed;
  } catch {
    const legacy: Record<string, string[]> = {
      both: ['openai', 'gemini'],
      all: ['openai', 'gemini', 'zai'],
      openai: ['openai'],
      gemini: ['gemini'],
      zai: ['zai'],
      lmstudio: [],
    };
    providers = legacy[raw] || ['openai', 'gemini'];
  }

  // Key-info extraction needs a cloud text model. Honour the user's selection
  // when a matching API key exists, otherwise fall back to whichever key is set.
  const openaiKey = getApiKey('openai', store, console);
  const geminiKey = getApiKey('gemini', store, console);
  let useOpenAI = false;
  let useGemini = false;
  if (providers.includes('openai') && openaiKey) useOpenAI = true;
  else if (providers.includes('gemini') && geminiKey) useGemini = true;
  else if (openaiKey) useOpenAI = true;
  else if (geminiKey) useGemini = true;

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
  
  throw new Error('No AI model configured for key information extraction (set an OpenAI or Gemini API key)');
};

// LM Studio Settings Helper (for backward compatibility)
export const getLMStudioSettings = (store: any) => {
  return {
    enabled: store.get('lmstudioEnabled') || false,
    endpoint: store.get('lmstudioEndpoint') || LMSTUDIO_CONFIG.DEFAULT_ENDPOINT,
    model: store.get('lmstudioModel') || LMSTUDIO_CONFIG.DEFAULT_MODEL,
  };
};

export const getLMStudioClient = (store: any) => {
  return getOpenAICompatibleClient('lmstudio', store);
};

export const getCurrentLMStudioModel = (store: any) => {
  return getOpenAICompatibleModel('lmstudio', store);
};
