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
  },
  claude: {
    model: AI_MODELS.claude.default
  }
};

// Token cost calculation based on provider and model
export const calculateTokenCost = (provider: string, model: string, promptTokens: number, completionTokens: number): number => {
  const modelLower = model ? model.toLowerCase() : '';
  let inputCostPerM = 0;
  let outputCostPerM = 0;

  if (provider === 'openai') {
    if (modelLower.includes('gpt-4o-mini')) {
      inputCostPerM = 0.15;
      outputCostPerM = 0.60;
    } else if (modelLower.includes('gpt-4o')) {
      inputCostPerM = 2.50;
      outputCostPerM = 10.00;
    } else if (modelLower.includes('gpt-4')) {
      inputCostPerM = 30.00;
      outputCostPerM = 60.00;
    } else if (modelLower.includes('gpt-3.5')) {
      inputCostPerM = 0.50;
      outputCostPerM = 1.50;
    } else if (modelLower.includes('o1-mini')) {
      inputCostPerM = 3.00;
      outputCostPerM = 12.00;
    } else if (modelLower.includes('o1')) {
      inputCostPerM = 15.00;
      outputCostPerM = 60.00;
    } else if (modelLower.includes('o3-mini')) {
      inputCostPerM = 1.10;
      outputCostPerM = 4.40;
    } else {
      inputCostPerM = 2.50;
      outputCostPerM = 10.00;
    }
  } else if (provider === 'gemini') {
    if (modelLower.includes('gemini-2.5-flash') || modelLower.includes('gemini-2.0-flash')) {
      inputCostPerM = 0.075;
      outputCostPerM = 0.30;
    } else if (modelLower.includes('gemini-1.5-flash')) {
      inputCostPerM = 0.075;
      outputCostPerM = 0.30;
    } else if (modelLower.includes('gemini-1.5-pro') || modelLower.includes('gemini-2.0-pro') || modelLower.includes('gemini-2.5-pro')) {
      inputCostPerM = 1.25;
      outputCostPerM = 5.00;
    } else if (modelLower.includes('gemini-1.0-pro')) {
      inputCostPerM = 0.50;
      outputCostPerM = 1.50;
    } else {
      inputCostPerM = 0.075;
      outputCostPerM = 0.30;
    }
  } else if (provider === 'zai') {
    if (modelLower.includes('flash')) {
      inputCostPerM = 0.0;
      outputCostPerM = 0.0;
    } else if (modelLower.includes('glm-4.7') || modelLower.includes('glm-4.5')) {
      inputCostPerM = 0.60;
      outputCostPerM = 2.20;
    } else if (modelLower.includes('air')) {
      inputCostPerM = 0.20;
      outputCostPerM = 1.10;
    } else if (modelLower.includes('32b')) {
      inputCostPerM = 0.10;
      outputCostPerM = 0.10;
    } else {
      inputCostPerM = 0.60;
      outputCostPerM = 2.20;
    }
  } else if (provider === 'lmstudio') {
    inputCostPerM = 0.0;
    outputCostPerM = 0.0;
  } else if (provider === 'claude') {
    if (modelLower.includes('haiku')) {
      inputCostPerM = 0.80;
      outputCostPerM = 4.00;
    } else if (modelLower.includes('sonnet')) {
      inputCostPerM = 3.00;
      outputCostPerM = 15.00;
    } else if (modelLower.includes('opus')) {
      inputCostPerM = 15.00;
      outputCostPerM = 75.00;
    } else {
      // Default Sonnet 3.5 pricing
      inputCostPerM = 3.00;
      outputCostPerM = 15.00;
    }
  }

  const inputCost = (promptTokens / 1_000_000) * inputCostPerM;
  const outputCost = (completionTokens / 1_000_000) * outputCostPerM;

  return inputCost + outputCost;
};

// Record token usage in store and emit IPC event to renderer
export const recordTokenUsage = (
  store: any,
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
) => {
  const totalTokens = promptTokens + completionTokens;
  const cost = calculateTokenCost(provider, model, promptTokens, completionTokens);

  try {
    const accumulated = store.get('accumulatedTokenUsage') || {};
    const currentProviderUsage = accumulated[provider] || {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      cost: 0,
      requestCount: 0
    };

    const updatedProviderUsage = {
      inputTokens: currentProviderUsage.inputTokens + promptTokens,
      outputTokens: currentProviderUsage.outputTokens + completionTokens,
      totalTokens: currentProviderUsage.totalTokens + totalTokens,
      cost: currentProviderUsage.cost + cost,
      requestCount: (currentProviderUsage.requestCount || 0) + 1
    };

    accumulated[provider] = updatedProviderUsage;
    store.set('accumulatedTokenUsage', accumulated);

    // Notify renderer via IPC
    const { getMainWindow } = require('../window');
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('token-usage-updated', {
        provider,
        model,
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
        cumulative: accumulated
      });
    }
  } catch (err) {
    console.error('Error recording token usage:', err);
  }
};

// API Key Management
export const getApiKey = (type: 'openai' | 'gemini' | 'zai' | 'claude', store: any, log: any) => {
  const keys = {
    openai: store.get('openaiApiKey') || store.get('apiKey') || process.env.OPENAI_API_KEY || '',
    gemini: store.get('geminiApiKey') || process.env.GEMINI_API_KEY || '',
    zai: store.get('zaiApiKey') || process.env.ZAI_API_KEY || '',
    claude: store.get('claudeApiKey') || process.env.ANTHROPIC_API_KEY || ''
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
  if (response.usage) {
    recordTokenUsage(
      store,
      providerId,
      model,
      response.usage.prompt_tokens || 0,
      response.usage.completion_tokens || 0
    );
  }
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
  if (response.usage) {
    recordTokenUsage(
      store,
      providerId,
      model,
      response.usage.prompt_tokens || 0,
      response.usage.completion_tokens || 0
    );
  }
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
// Streaming (token-by-token) variants
// These mirror the non-streaming functions above but invoke a
// transport-agnostic `onDelta` callback for each token chunk and
// resolve with the full concatenated text. They are intentionally
// IPC-free — the caller (ipc/ai.ts) wires `onDelta` to the renderer.
// ============================================================

type OnDelta = (delta: string) => void;

// Generic OpenAI-compatible chat-completion stream. `messages` is passed
// through verbatim so it also supports multimodal (image_url) content.
export const streamChatCompletion = async (
  client: OpenAI,
  model: string,
  messages: any[],
  onDelta: OnDelta,
  store?: any,
  providerId?: string
): Promise<string> => {
  const options: any = {
    model,
    messages,
    stream: true,
  };

  // Only request usage options for known cloud providers to prevent issues with local/mock endpoints
  if (providerId === 'openai' || providerId === 'zai') {
    options.stream_options = { include_usage: true };
  }

  const stream = await client.chat.completions.create(options);

  let full = '';
  for await (const chunk of stream as any) {
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) {
      full += delta;
      onDelta(delta);
    }
    if (chunk.usage && store && providerId) {
      recordTokenUsage(
        store,
        providerId,
        model,
        chunk.usage.prompt_tokens || 0,
        chunk.usage.completion_tokens || 0
      );
    }
  }
  return full;
};

export const streamPromptToOpenAICompatible = async (
  providerId: string,
  prompt: string,
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const client = getOpenAICompatibleClient(providerId, store);
  const model = getOpenAICompatibleModel(providerId, store);
  const systemPrompt = getCustomSystemPrompt(store);

  const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  return streamChatCompletion(client, model, messages, onDelta, store, providerId);
};

export const streamConversationToOpenAICompatible = async (
  providerId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const client = getOpenAICompatibleClient(providerId, store);
  const model = getOpenAICompatibleModel(providerId, store);
  const systemPrompt = getCustomSystemPrompt(store);

  const apiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }
  apiMessages.push(...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })));

  return streamChatCompletion(client, model, apiMessages, onDelta, store, providerId);
};

export const streamPromptToOpenAI = (prompt: string, store: any, onDelta: OnDelta) =>
  streamPromptToOpenAICompatible('openai', prompt, store, onDelta);
export const streamPromptToZAI = (prompt: string, store: any, onDelta: OnDelta) =>
  streamPromptToOpenAICompatible('zai', prompt, store, onDelta);
export const streamPromptToLMStudio = (prompt: string, store: any, onDelta: OnDelta) =>
  streamPromptToOpenAICompatible('lmstudio', prompt, store, onDelta);

export const streamConversationToOpenAI = (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>, store: any, onDelta: OnDelta
) => streamConversationToOpenAICompatible('openai', messages, store, onDelta);
export const streamConversationToZAI = (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>, store: any, onDelta: OnDelta
) => streamConversationToOpenAICompatible('zai', messages, store, onDelta);
export const streamConversationToLMStudio = (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>, store: any, onDelta: OnDelta
) => streamConversationToOpenAICompatible('lmstudio', messages, store, onDelta);

// Gemini streaming. `parts` accepts plain text and/or createPartFromUri image
// parts, mirroring sendPromptToGemini.
export const streamPromptToGemini = async (
  parts: any[],
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const ai = getGeminiClient(store);
  const { createUserContent } = require('@google/genai');
  const systemPrompt = getCustomSystemPrompt(store);

  const model = getCurrentGeminiModel(store);
  const config: any = {
    model,
    contents: [createUserContent(parts)],
  };
  if (systemPrompt) {
    config.systemInstruction = systemPrompt;
  }

  const stream = await ai.models.generateContentStream(config);
  let full = '';
  for await (const chunk of stream) {
    const t = chunk.text || '';
    if (t) {
      full += t;
      onDelta(t);
    }
    if (chunk.usageMetadata) {
      recordTokenUsage(
        store,
        'gemini',
        model,
        chunk.usageMetadata.promptTokenCount || 0,
        chunk.usageMetadata.candidatesTokenCount || 0
      );
    }
  }
  return full;
};

export const streamConversationToGemini = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const ai = getGeminiClient(store);
  const systemPrompt = getCustomSystemPrompt(store);

  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const model = getCurrentGeminiModel(store);
  const config: any = {
    model,
    contents,
  };
  if (systemPrompt) {
    config.systemInstruction = systemPrompt;
  }

  const stream = await ai.models.generateContentStream(config);
  let full = '';
  for await (const chunk of stream) {
    const t = chunk.text || '';
    if (t) {
      full += t;
      onDelta(t);
    }
    if (chunk.usageMetadata) {
      recordTokenUsage(
        store,
        'gemini',
        model,
        chunk.usageMetadata.promptTokenCount || 0,
        chunk.usageMetadata.candidatesTokenCount || 0
      );
    }
  }
  return full;
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
export const sendPromptToGemini = async (prompt: string[], store: any) => {
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

  const response = await ai.models.generateContent(config);

  if (response && response.usageMetadata) {
    recordTokenUsage(
      store,
      'gemini',
      config.model,
      response.usageMetadata.promptTokenCount || 0,
      response.usageMetadata.candidatesTokenCount || 0
    );
  }

  return response;
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

  if (response && response.usageMetadata) {
    recordTokenUsage(
      store,
      'gemini',
      config.model,
      response.usageMetadata.promptTokenCount || 0,
      response.usageMetadata.candidatesTokenCount || 0
    );
  }
  
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
      const model = getCurrentOpenAIModel(store);
      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: 'You are a document analyzer. Extract key information accurately and comprehensively.' },
          { role: 'user', content: prompt }
        ],
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
      return response.choices[0]?.message?.content || '';
    } catch (openaiError) {
      console.error('OpenAI extraction failed:', openaiError);
      throw new Error('Failed to extract key information using OpenAI');
    }
  } else if (useGemini) {
    // Use Gemini (explicitly selected)
    try {
      const ai = getGeminiClient(store);
      const model = getCurrentGeminiModel(store);
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });
      if (response.usageMetadata) {
        recordTokenUsage(
          store,
          'gemini',
          model,
          response.usageMetadata.promptTokenCount || 0,
          response.usageMetadata.candidatesTokenCount || 0
        );
      }
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

// ============================================================
// Anthropic / Claude Dedicated Client
// ============================================================

export const getClaudeClient = (store: any) => {
  const apiKey = getApiKey('claude', store, console);
  if (!apiKey) {
    throw new Error('Claude API key is not configured');
  }
  return {
    apiKey,
    baseURL: 'https://api.anthropic.com/v1/messages'
  };
};

export const getCurrentClaudeModel = (store: any) => {
  return store.get('claudeModel') || AI_CONFIG.claude.model;
};

export const sendPromptToClaude = async (
  prompt: string,
  store: any
): Promise<string> => {
  const client = getClaudeClient(store);
  const model = getCurrentClaudeModel(store);
  const systemPrompt = getCustomSystemPrompt(store);

  const requestBody: any = {
    model,
    max_tokens: 4096,
    messages: [
      { role: 'user', content: prompt }
    ]
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  console.log('\n========== CLAUDE PROMPT ==========');
  console.log('Model:', model);
  console.log('System Prompt:', systemPrompt || '(none)');
  console.log('User Prompt:', prompt);
  console.log('====================================\n');

  const fetch = require('node-fetch');
  const response = await fetch(client.baseURL, {
    method: 'POST',
    headers: {
      'x-api-key': client.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.usage) {
    recordTokenUsage(
      store,
      'claude',
      model,
      data.usage.input_tokens || 0,
      data.usage.output_tokens || 0
    );
  }
  return data.content?.[0]?.text || '';
};

export const sendConversationToClaude = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any
): Promise<string> => {
  const client = getClaudeClient(store);
  const model = getCurrentClaudeModel(store);
  const systemPrompt = getCustomSystemPrompt(store);

  const apiMessages = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const requestBody: any = {
    model,
    max_tokens: 4096,
    messages: apiMessages
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  console.log('\n========== CLAUDE CONVERSATION ==========');
  console.log('Model:', model);
  console.log('Messages:', JSON.stringify(apiMessages, null, 2));
  console.log('==========================================\n');

  const fetch = require('node-fetch');
  const response = await fetch(client.baseURL, {
    method: 'POST',
    headers: {
      'x-api-key': client.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.usage) {
    recordTokenUsage(
      store,
      'claude',
      model,
      data.usage.input_tokens || 0,
      data.usage.output_tokens || 0
    );
  }
  return data.content?.[0]?.text || '';
};

export const sendPromptWithScreenshotsToClaude = async (
  prompt: string,
  screenshots: string[],
  store: any
): Promise<string> => {
  const client = getClaudeClient(store);
  const model = getCurrentClaudeModel(store);
  const systemPrompt = getCustomSystemPrompt(store);
  const { imageToBase64 } = require('../utils/files');

  const content: any[] = [{ type: 'text', text: prompt }];

  for (const screenshotPath of screenshots) {
    try {
      const base64Image = imageToBase64(screenshotPath);
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64Image
        }
      });
    } catch (error) {
      console.error(`Error processing image ${screenshotPath} for Claude:`, error);
    }
  }

  const requestBody: any = {
    model,
    max_tokens: 4096,
    messages: [
      { role: 'user', content }
    ]
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  console.log('\n========== CLAUDE PROMPT WITH SCREENSHOTS ==========');
  console.log('Model:', model);
  console.log('System Prompt:', systemPrompt || '(none)');
  console.log('Text Prompt:', prompt);
  console.log('Screenshots count:', screenshots.length);
  console.log('====================================================\n');

  const fetch = require('node-fetch');
  const response = await fetch(client.baseURL, {
    method: 'POST',
    headers: {
      'x-api-key': client.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.usage) {
    recordTokenUsage(
      store,
      'claude',
      model,
      data.usage.input_tokens || 0,
      data.usage.output_tokens || 0
    );
  }
  return data.content?.[0]?.text || '';
};

const streamClaudeAPI = async (
  client: any,
  requestBody: any,
  onDelta: OnDelta,
  store: any
): Promise<string> => {
  const fetch = require('node-fetch');
  const response = await fetch(client.baseURL, {
    method: 'POST',
    headers: {
      'x-api-key': client.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorText}`);
  }

  let full = '';
  const body = response.body;
  if (!body) {
    return '';
  }

  // Parse SSE stream
  let buffer = '';
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const chunk of body) {
    buffer += chunk.toString('utf8');
    let boundary = buffer.indexOf('\n');
    while (boundary !== -1) {
      const line = buffer.substring(0, boundary).trim();
      buffer = buffer.substring(boundary + 1);
      boundary = buffer.indexOf('\n');

      if (line.startsWith('data:')) {
        const dataStr = line.substring(5).trim();
        if (dataStr === '[DONE]') {
          continue;
        }
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.type === 'message_start' && parsed.message?.usage?.input_tokens) {
            inputTokens = parsed.message.usage.input_tokens;
          }
          if (parsed.type === 'message_delta' && parsed.usage?.output_tokens) {
            outputTokens = parsed.usage.output_tokens;
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            const delta = parsed.delta.text;
            full += delta;
            onDelta(delta);
          }
        } catch (e) {
          // Ignore parsing errors for non-JSON or partial lines
        }
      }
    }
  }

  if (inputTokens > 0 || outputTokens > 0) {
    recordTokenUsage(store, 'claude', requestBody.model, inputTokens, outputTokens);
  }

  return full;
};

export const streamPromptToClaude = async (
  prompt: string,
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const client = getClaudeClient(store);
  const model = getCurrentClaudeModel(store);
  const systemPrompt = getCustomSystemPrompt(store);

  const requestBody: any = {
    model,
    max_tokens: 4096,
    messages: [
      { role: 'user', content: prompt }
    ],
    stream: true
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  console.log('\n========== CLAUDE STREAM PROMPT ==========');
  console.log('Model:', model);
  console.log('System Prompt:', systemPrompt || '(none)');
  console.log('User Prompt:', prompt);
  console.log('==========================================\n');

  return streamClaudeAPI(client, requestBody, onDelta, store);
};

export const streamConversationToClaude = async (
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const client = getClaudeClient(store);
  const model = getCurrentClaudeModel(store);
  const systemPrompt = getCustomSystemPrompt(store);

  const apiMessages = messages.map(m => ({
    role: m.role,
    content: m.content
  }));

  const requestBody: any = {
    model,
    max_tokens: 4096,
    messages: apiMessages,
    stream: true
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  console.log('\n========== CLAUDE STREAM CONVERSATION ==========');
  console.log('Model:', model);
  console.log('Messages:', JSON.stringify(apiMessages, null, 2));
  console.log('================================================\n');

  return streamClaudeAPI(client, requestBody, onDelta, store);
};

export const streamPromptWithScreenshotsToClaude = async (
  prompt: string,
  screenshots: string[],
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const client = getClaudeClient(store);
  const model = getCurrentClaudeModel(store);
  const systemPrompt = getCustomSystemPrompt(store);
  const { imageToBase64 } = require('../utils/files');

  const content: any[] = [{ type: 'text', text: prompt }];

  for (const screenshotPath of screenshots) {
    try {
      const base64Image = imageToBase64(screenshotPath);
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: base64Image
        }
      });
    } catch (error) {
      console.error(`Error processing image ${screenshotPath} for Claude:`, error);
    }
  }

  const requestBody: any = {
    model,
    max_tokens: 4096,
    messages: [
      { role: 'user', content }
    ],
    stream: true
  };

  if (systemPrompt) {
    requestBody.system = systemPrompt;
  }

  console.log('\n========== CLAUDE STREAM PROMPT WITH SCREENSHOTS ==========');
  console.log('Model:', model);
  console.log('System Prompt:', systemPrompt || '(none)');
  console.log('Text Prompt:', prompt);
  console.log('Screenshots count:', screenshots.length);
  console.log('==========================================================\n');

  return streamClaudeAPI(client, requestBody, onDelta, store);
};

export const testClaudeConnection = async (store: any): Promise<{ success: boolean; model?: string; error?: string }> => {
  try {
    const client = getClaudeClient(store);
    const model = getCurrentClaudeModel(store);

    const fetch = require('node-fetch');
    const response = await fetch(client.baseURL, {
      method: 'POST',
      headers: {
        'x-api-key': client.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model,
        max_tokens: 5,
        messages: [{ role: 'user', content: 'Hi' }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Claude API error (${response.status}): ${errorText}` };
    }

    return { success: true, model };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
};
