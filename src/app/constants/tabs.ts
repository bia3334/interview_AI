/**
 * Tab configuration for the main application navigation.
 * Add new tabs here to extend the application.
 */

/** Tab ID constants - use these instead of hardcoded strings */
export const TAB = {
  PROMPT: 'prompt',
  HISTORY: 'history',
  SETTINGS: 'settings',
  SHORTCUTS: 'shortcuts',
} as const;

export type TabId = typeof TAB[keyof typeof TAB];

export interface TabConfig {
  id: TabId;
  label: string;
}

export const TABS: TabConfig[] = [
  { id: TAB.PROMPT, label: 'Prompt' },
  { id: TAB.HISTORY, label: 'History' },
  { id: TAB.SETTINGS, label: 'Settings' },
  { id: TAB.SHORTCUTS, label: 'Shortcuts' },
];

/** Array of tab IDs for navigation logic */
export const TAB_IDS = TABS.map(tab => tab.id);

/** Default tab to show on app start */
export const DEFAULT_TAB: TabId = TAB.PROMPT;
