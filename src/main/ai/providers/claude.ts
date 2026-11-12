/**
 * Anthropic Messages API over plain fetch (no SDK).
 */
import { ChatMessage, ConnectionTestResult, OnDelta, AI_CONFIG, getApiKey, getCustomSystemPrompt, logRequest } from '../settings';
import { recordTokenUsage } from '../usage';
import { imageToBase64 } from '../../utils/files';

const fetch = require('node-fetch');

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_VERSION = '2023-06-01';
const CLAUDE_MAX_TOKENS = 4096;

type ClaudeMessage = { role: 'user' | 'assistant'; content: string | any[] };

export const getClaudeClient = (store: any) => {
  const apiKey = getApiKey('claude', store, console);
  if (!apiKey) {
    throw new Error('Claude API key is not configured');
  }
  return { apiKey, baseURL: CLAUDE_API_URL };
};

export const getCurrentClaudeModel = (store: any): string =>
  store.get('claudeModel') || AI_CONFIG.claude.model;

// ---------- Request building ----------

const buildBody = (store: any, messages: ClaudeMessage[], extra: Record<string, unknown> = {}) => {
  const systemPrompt = getCustomSystemPrompt(store);
  return {
    model: getCurrentClaudeModel(store),
    max_tokens: CLAUDE_MAX_TOKENS,
    messages,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...extra,
  };
};

/** One user message: the prompt followed by each screenshot that could be read. */
const screenshotMessage = (prompt: string, screenshots: string[]): ClaudeMessage => {
  const content: any[] = [{ type: 'text', text: prompt }];
  for (const screenshotPath of screenshots) {
    try {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: imageToBase64(screenshotPath) },
      });
    } catch (error) {
      console.error(`Error processing image ${screenshotPath} for Claude:`, error);
    }
  }
  return { role: 'user', content };
};

const promptMessage = (prompt: string): ClaudeMessage => ({ role: 'user', content: prompt });

const toClaudeMessages = (messages: ChatMessage[]): ClaudeMessage[] =>
  messages.map(m => ({ role: m.role, content: m.content }));

// ---------- Transport ----------

/** POSTs to the Messages API and throws on a non-2xx status. */
const post = async (store: any, body: object) => {
  const client = getClaudeClient(store);
  const response = await fetch(client.baseURL, {
    method: 'POST',
    headers: {
      'x-api-key': client.apiKey,
      'anthropic-version': CLAUDE_API_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Claude API error (${response.status}): ${await response.text()}`);
  }
  return response;
};

const send = async (store: any, messages: ClaudeMessage[]): Promise<string> => {
  const body = buildBody(store, messages);
  const data = await (await post(store, body)).json();

  if (data.usage) {
    recordTokenUsage(store, 'claude', body.model, data.usage.input_tokens || 0, data.usage.output_tokens || 0);
  }
  return data.content?.[0]?.text || '';
};

/** Yields the parsed JSON payload of each `data:` line of a server-sent-event stream. */
async function* sseEvents(body: AsyncIterable<Buffer>): AsyncGenerator<any> {
  let buffer = '';
  for await (const chunk of body) {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      try {
        yield JSON.parse(trimmed.substring(5).trim());
      } catch {
        // Not JSON (e.g. "[DONE]"): skip.
      }
    }
  }
}

const stream = async (store: any, messages: ClaudeMessage[], onDelta: OnDelta): Promise<string> => {
  const body = buildBody(store, messages, { stream: true });
  const response = await post(store, body);
  if (!response.body) return '';

  let full = '';
  let inputTokens = 0;
  let outputTokens = 0;
  for await (const event of sseEvents(response.body)) {
    if (event.type === 'message_start') {
      inputTokens = event.message?.usage?.input_tokens || inputTokens;
    } else if (event.type === 'message_delta') {
      outputTokens = event.usage?.output_tokens || outputTokens;
    } else if (event.type === 'content_block_delta' && event.delta?.text) {
      full += event.delta.text;
      onDelta(event.delta.text);
    }
  }

  if (inputTokens > 0 || outputTokens > 0) {
    recordTokenUsage(store, 'claude', body.model, inputTokens, outputTokens);
  }
  return full;
};

// ---------- Logging ----------

const logPrompt = (title: string, store: any, prompt: string, screenshots?: string[]) =>
  logRequest(title, {
    Model: getCurrentClaudeModel(store),
    'System Prompt': getCustomSystemPrompt(store) || '(none)',
    'User Prompt': prompt,
    ...(screenshots ? { 'Screenshots count': screenshots.length } : {}),
  });

const logConversation = (title: string, store: any, messages: ChatMessage[]) =>
  logRequest(title, {
    Model: getCurrentClaudeModel(store),
    Messages: JSON.stringify(messages, null, 2),
  });

// ---------- Public API ----------

export const sendPromptToClaude = (prompt: string, store: any): Promise<string> => {
  logPrompt('CLAUDE PROMPT', store, prompt);
  return send(store, [promptMessage(prompt)]);
};

export const sendConversationToClaude = (messages: ChatMessage[], store: any): Promise<string> => {
  logConversation('CLAUDE CONVERSATION', store, messages);
  return send(store, toClaudeMessages(messages));
};

export const sendPromptWithScreenshotsToClaude = (
  prompt: string,
  screenshots: string[],
  store: any
): Promise<string> => {
  logPrompt('CLAUDE PROMPT WITH SCREENSHOTS', store, prompt, screenshots);
  return send(store, [screenshotMessage(prompt, screenshots)]);
};

export const streamPromptToClaude = (prompt: string, store: any, onDelta: OnDelta): Promise<string> => {
  logPrompt('CLAUDE STREAM PROMPT', store, prompt);
  return stream(store, [promptMessage(prompt)], onDelta);
};

export const streamConversationToClaude = (
  messages: ChatMessage[],
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  logConversation('CLAUDE STREAM CONVERSATION', store, messages);
  return stream(store, toClaudeMessages(messages), onDelta);
};

export const streamPromptWithScreenshotsToClaude = (
  prompt: string,
  screenshots: string[],
  store: any,
  onDelta: OnDelta
): Promise<string> => {
  logPrompt('CLAUDE STREAM PROMPT WITH SCREENSHOTS', store, prompt, screenshots);
  return stream(store, [screenshotMessage(prompt, screenshots)], onDelta);
};

export const testClaudeConnection = async (store: any): Promise<ConnectionTestResult> => {
  try {
    const model = getCurrentClaudeModel(store);
    await post(store, { model, max_tokens: 5, messages: [promptMessage('Hi')] });
    return { success: true, model };
  } catch (error: any) {
    return { success: false, error: error.message || 'Connection failed' };
  }
};
