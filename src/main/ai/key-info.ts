import { getApiKey } from './settings';
import { recordTokenUsage } from './usage';
import { generateKeyInfoExtractionPrompt } from './prompts';
import { getCurrentOpenAIModel, getOpenAIClient } from './providers/openai-compatible';
import { getCurrentGeminiModel, getGeminiClient } from './providers/gemini';

type ExtractionProvider = 'openai' | 'gemini';

const EXTRACTION_SYSTEM_PROMPT =
  'You are a document analyzer. Extract key information accurately and comprehensively.';

/** Legacy string values of the `defaultModel` setting, from before it became a JSON array. */
const LEGACY_DEFAULT_MODELS: Record<string, string[]> = {
  both: ['openai', 'gemini'],
  all: ['openai', 'gemini', 'zai'],
  openai: ['openai'],
  gemini: ['gemini'],
  zai: ['zai'],
  lmstudio: [],
};

/** The providers the user selected, whichever format `defaultModel` is stored in. */
const getSelectedProviders = (store: any): string[] => {
  const raw = store.get('defaultModel') || 'both';
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return LEGACY_DEFAULT_MODELS[raw] || ['openai', 'gemini'];
  }
};

/**
 * Extraction needs a cloud text model: the user's selection when it has an
 * API key, otherwise whichever key is set. OpenAI is preferred over Gemini.
 */
const pickProvider = (store: any): ExtractionProvider | undefined => {
  const candidates: ExtractionProvider[] = ['openai', 'gemini'];
  const withKey = candidates.filter(p => getApiKey(p, store, console));
  const selected = getSelectedProviders(store);
  return withKey.find(p => selected.includes(p)) || withKey[0];
};

const extractWithOpenAI = async (prompt: string, store: any): Promise<string> => {
  const model = getCurrentOpenAIModel(store);
  const response = await getOpenAIClient(store).chat.completions.create({
    model,
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
  });
  if (response.usage) {
    recordTokenUsage(store, 'openai', model, response.usage.prompt_tokens || 0, response.usage.completion_tokens || 0);
  }
  return response.choices[0]?.message?.content || '';
};

const extractWithGemini = async (prompt: string, store: any): Promise<string> => {
  const model = getCurrentGeminiModel(store);
  const response = await getGeminiClient(store).models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
  });
  const usage = response.usageMetadata;
  if (usage) {
    recordTokenUsage(store, 'gemini', model, usage.promptTokenCount || 0, usage.candidatesTokenCount || 0);
  }
  return response.text || '';
};

const EXTRACTORS: Record<ExtractionProvider, { name: string; run: (prompt: string, store: any) => Promise<string> }> = {
  openai: { name: 'OpenAI', run: extractWithOpenAI },
  gemini: { name: 'Gemini', run: extractWithGemini },
};

export const extractKeyInfoFromDocument = async (
  content: string,
  fileName: string,
  store: any
): Promise<string> => {
  const provider = pickProvider(store);
  if (!provider) {
    throw new Error('No AI model configured for key information extraction (set an OpenAI or Gemini API key)');
  }

  const extractor = EXTRACTORS[provider];
  try {
    return await extractor.run(generateKeyInfoExtractionPrompt(fileName, content), store);
  } catch (error) {
    console.error(`${extractor.name} extraction failed:`, error);
    throw new Error(`Failed to extract key information using ${extractor.name}`);
  }
};
