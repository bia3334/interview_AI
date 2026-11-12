/**
 * Token pricing, in USD per 1M tokens.
 *
 * Each provider has an ordered list of rules: the first rule whose `match`
 * substring appears in the (lower-cased) model name wins, so more specific
 * names must come before their prefixes ('gpt-4o-mini' before 'gpt-4o').
 * Models that match no rule use the provider's `fallback` price.
 */
interface Price {
  input: number;
  output: number;
}

interface PriceRule extends Price {
  match: string[];
}

interface ProviderPricing {
  rules: PriceRule[];
  fallback: Price;
}

const FREE: Price = { input: 0, output: 0 };

const PRICING: Record<string, ProviderPricing> = {
  openai: {
    rules: [
      { match: ['gpt-4o-mini'], input: 0.15, output: 0.60 },
      { match: ['gpt-4o'], input: 2.50, output: 10.00 },
      { match: ['gpt-4'], input: 30.00, output: 60.00 },
      { match: ['gpt-3.5'], input: 0.50, output: 1.50 },
      { match: ['o1-mini'], input: 3.00, output: 12.00 },
      { match: ['o1'], input: 15.00, output: 60.00 },
      { match: ['o3-mini'], input: 1.10, output: 4.40 },
    ],
    fallback: { input: 2.50, output: 10.00 },
  },
  gemini: {
    rules: [
      { match: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'], input: 0.075, output: 0.30 },
      { match: ['gemini-1.5-pro', 'gemini-2.0-pro', 'gemini-2.5-pro'], input: 1.25, output: 5.00 },
      { match: ['gemini-1.0-pro'], input: 0.50, output: 1.50 },
    ],
    fallback: { input: 0.075, output: 0.30 },
  },
  zai: {
    rules: [
      { match: ['flash'], ...FREE },
      { match: ['glm-4.7', 'glm-4.5'], input: 0.60, output: 2.20 },
      { match: ['air'], input: 0.20, output: 1.10 },
      { match: ['32b'], input: 0.10, output: 0.10 },
    ],
    fallback: { input: 0.60, output: 2.20 },
  },
  lmstudio: {
    rules: [],
    fallback: FREE,
  },
  claude: {
    rules: [
      { match: ['haiku'], input: 0.80, output: 4.00 },
      { match: ['sonnet'], input: 3.00, output: 15.00 },
      { match: ['opus'], input: 15.00, output: 75.00 },
    ],
    fallback: { input: 3.00, output: 15.00 },
  },
};

const findPrice = (provider: string, model: string): Price => {
  const pricing = PRICING[provider];
  if (!pricing) return FREE;

  const name = (model || '').toLowerCase();
  const rule = pricing.rules.find(r => r.match.some(m => name.includes(m)));
  return rule || pricing.fallback;
};

export const calculateTokenCost = (
  provider: string,
  model: string,
  promptTokens: number,
  completionTokens: number
): number => {
  const price = findPrice(provider, model);
  return (promptTokens * price.input + completionTokens * price.output) / 1_000_000;
};
