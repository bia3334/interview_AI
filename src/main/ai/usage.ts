import { calculateTokenCost } from './pricing';

interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  requestCount: number;
}

const EMPTY_USAGE: ProviderUsage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  cost: 0,
  requestCount: 0,
};

/** Adds one request to the per-provider totals in the store and tells the renderer. */
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
    const accumulated: Record<string, ProviderUsage> = store.get('accumulatedTokenUsage') || {};
    const current = accumulated[provider] || EMPTY_USAGE;

    accumulated[provider] = {
      inputTokens: current.inputTokens + promptTokens,
      outputTokens: current.outputTokens + completionTokens,
      totalTokens: current.totalTokens + totalTokens,
      cost: current.cost + cost,
      requestCount: (current.requestCount || 0) + 1,
    };
    store.set('accumulatedTokenUsage', accumulated);

    // Required lazily: window -> store -> ai would otherwise be a circular import.
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
        cumulative: accumulated,
      });
    }
  } catch (err) {
    console.error('Error recording token usage:', err);
  }
};
