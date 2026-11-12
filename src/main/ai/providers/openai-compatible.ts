/**
 * One client for every provider that speaks the OpenAI chat-completions API
 * (OpenAI, Z.AI, LM Studio). Per-provider differences live as data in
 * OPENAI_COMPATIBLE_PROVIDERS, not as branches here.
 */
import { OpenAI } from 'openai';
import { OPENAI_COMPATIBLE_PROVIDERS, OpenAICompatibleProvider } from '../../constants/ai';
import { ChatMessage, ConnectionTestResult, OnDelta, getApiKey, getCustomSystemPrompt, logRequest } from '../settings';
import { recordTokenUsage } from '../usage';

type ApiMessage = { role: 'system' | 'user' | 'assistant'; content: string };

const getProvider = (providerId: string): OpenAICompatibleProvider => {
  const provider = OPENAI_COMPATIBLE_PROVIDERS[providerId];
  if (!provider) {
    throw new Error(`Unknown provider: ${providerId}`);
  }
  return provider;
};

export const getOpenAICompatibleClient = (providerId: string, store: any): OpenAI => {
  const provider = getProvider(providerId);

  const apiKey = provider.requiresApiKey ? store.get(provider.apiKeyStore) : 'not-needed';
  if (!apiKey) {
    throw new Error(`${provider.name} API key is not configured`);
  }

  const customBaseURL = provider.baseURLStore && store.get(provider.baseURLStore);
  return new OpenAI({ apiKey, baseURL: customBaseURL || provider.baseURL });
};

export const getOpenAICompatibleModel = (providerId: string, store: any): string => {
  const provider = getProvider(providerId);
  return store.get(provider.modelStore) || provider.defaultModel;
};

/** OpenAI client that also accepts the legacy `apiKey` store key and OPENAI_API_KEY. */
export const getOpenAIClient = (store: any) => {
  const apiKey = getApiKey('openai', store, console);
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey });
};

export const getCurrentOpenAIModel = (store: any): string =>
  getOpenAICompatibleModel('openai', store);

const withSystemPrompt = (store: any, messages: ChatMessage[]): ApiMessage[] => {
  const systemPrompt = getCustomSystemPrompt(store);
  return systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages;
};

const recordUsage = (store: any, providerId: string, model: string, usage: any) => {
  if (!usage) return;
  recordTokenUsage(store, providerId, model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
};

// ---------- Non-streaming ----------

export const sendConversationToOpenAICompatible = async (
  providerId: string,
  messages: ChatMessage[],
  store: any
): Promise<string> => {
  const client = getOpenAICompatibleClient(providerId, store);
  const model = getOpenAICompatibleModel(providerId, store);
  const apiMessages = withSystemPrompt(store, messages);

  logRequest(`${providerId.toUpperCase()} REQUEST`, {
    Model: model,
    Messages: JSON.stringify(apiMessages, null, 2),
  });

  const response = await client.chat.completions.create({ model, messages: apiMessages });
  recordUsage(store, providerId, model, response.usage);
  return response.choices[0]?.message?.content || '';
};

export const sendPromptToOpenAICompatible = (providerId: string, prompt: string, store: any) =>
  sendConversationToOpenAICompatible(providerId, [{ role: 'user', content: prompt }], store);

// ---------- Streaming ----------

/**
 * Streams a chat completion, calling `onDelta` per token chunk and resolving
 * with the full text. `messages` is passed through verbatim so multimodal
 * (image_url) content works too. Usage is recorded when `store` and
 * `providerId` are given and the provider reports it.
 */
export const streamChatCompletion = async (
  client: OpenAI,
  model: string,
  messages: any[],
  onDelta: OnDelta,
  store?: any,
  providerId?: string
): Promise<string> => {
  const provider = providerId ? OPENAI_COMPATIBLE_PROVIDERS[providerId] : undefined;

  const stream = await client.chat.completions.create({
    model,
    messages,
    stream: true,
    // Local/mock endpoints can choke on stream_options, so only opt in where known to work.
    ...(provider?.supportsStreamUsage ? { stream_options: { include_usage: true } } : {}),
  });

  let full = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || '';
    if (delta) {
      full += delta;
      onDelta(delta);
    }
    if (store && providerId) {
      recordUsage(store, providerId, model, chunk.usage);
    }
  }
  return full;
};

export const streamConversationToOpenAICompatible = (
  providerId: string,
  messages: ChatMessage[],
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  const client = getOpenAICompatibleClient(providerId, store);
  const model = getOpenAICompatibleModel(providerId, store);
  return streamChatCompletion(client, model, withSystemPrompt(store, messages), onDelta, store, providerId);
};

export const streamPromptToOpenAICompatible = (
  providerId: string,
  prompt: string,
  store: any,
  onDelta: OnDelta
) => streamConversationToOpenAICompatible(providerId, [{ role: 'user', content: prompt }], store, onDelta);

// ---------- Connection test ----------

export const testOpenAICompatibleConnection = async (
  providerId: string,
  store: any
): Promise<ConnectionTestResult> => {
  try {
    const provider = getProvider(providerId);
    const client = getOpenAICompatibleClient(providerId, store);
    const model = getOpenAICompatibleModel(providerId, store);

    await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Hi' }],
      ...(provider.usesMaxCompletionTokens ? { max_completion_tokens: 5 } : { max_tokens: 5 }),
    });
    return { success: true, model };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
};

// ---------- Per-provider shortcuts ----------

const forProvider = (providerId: string) => ({
  sendPrompt: (prompt: string, store: any) => sendPromptToOpenAICompatible(providerId, prompt, store),
  sendConversation: (messages: ChatMessage[], store: any) =>
    sendConversationToOpenAICompatible(providerId, messages, store),
  streamPrompt: (prompt: string, store: any, onDelta: OnDelta) =>
    streamPromptToOpenAICompatible(providerId, prompt, store, onDelta),
  streamConversation: (messages: ChatMessage[], store: any, onDelta: OnDelta) =>
    streamConversationToOpenAICompatible(providerId, messages, store, onDelta),
  testConnection: (store: any) => testOpenAICompatibleConnection(providerId, store),
});

export const {
  sendPrompt: sendPromptToOpenAI,
  sendConversation: sendConversationToOpenAI,
  streamPrompt: streamPromptToOpenAI,
  streamConversation: streamConversationToOpenAI,
  testConnection: testOpenAIConnection,
} = forProvider('openai');

export const {
  sendPrompt: sendPromptToZAI,
  sendConversation: sendConversationToZAI,
  streamPrompt: streamPromptToZAI,
  streamConversation: streamConversationToZAI,
  testConnection: testZAIConnection,
} = forProvider('zai');

export const {
  sendPrompt: sendPromptToLMStudio,
  sendConversation: sendConversationToLMStudio,
  streamPrompt: streamPromptToLMStudio,
  streamConversation: streamConversationToLMStudio,
  testConnection: testLMStudioConnection,
} = forProvider('lmstudio');
