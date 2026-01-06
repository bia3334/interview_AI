/**
 * Global keyboard shortcuts registration
 */
import { clipboard, globalShortcut } from 'electron';

import { overlayManager } from './ipc/overlay';
import { addScreenshot, clearScreenshots, takeScreenshot } from './ipc/screenshots';
import { getLatestAIResponse } from './ipc/ai';
import { getMainWindow, moveWindow, notifyRenderer, toggleMainWindow, toggleMouseEvents } from './window';
import { SHORTCUTS } from './constants/shortcuts';
import { ANSWER_STYLES } from './constants/answer-styles';
import { AI_PROVIDER } from './constants/ai';
import type { AppStore } from './store';

/** All AI providers in order for cycling */
const AI_PROVIDERS = [AI_PROVIDER.BOTH, AI_PROVIDER.OPENAI, AI_PROVIDER.GEMINI];

/** Debounce tracking for shortcuts */
const lastTriggerTime: Map<string, number> = new Map();
const DEBOUNCE_MS = 300; // 300ms debounce

/** Debounce wrapper for shortcut handlers */
function debounced(key: string, fn: () => void): void {
  const now = Date.now();
  const lastTime = lastTriggerTime.get(key) || 0;
  if (now - lastTime < DEBOUNCE_MS) {
    return; // Skip if triggered too quickly
  }
  lastTriggerTime.set(key, now);
  fn();
}

export function registerGlobalShortcuts(
  deps: {
    store: AppStore;
    log: any;
    preloadPath: string;
  }
) {
  const { store, log, preloadPath } = deps;

  // Window controls
  globalShortcut.register(SHORTCUTS.TOGGLE_MOUSE_EVENTS, () => toggleMouseEvents());
  globalShortcut.register(SHORTCUTS.TOGGLE_WINDOW, () => toggleMainWindow(store));

  // Overlay toggle
  globalShortcut.register(SHORTCUTS.TOGGLE_OVERLAY, () => {
    const state = overlayManager.getState();
    const latestResponse = getLatestAIResponse();
    if (state.isVisible) {
      overlayManager.hide();
      if (state.isPinned) overlayManager.togglePin();
    } else {
      overlayManager.show(latestResponse, preloadPath);
      if (!state.isPinned) overlayManager.togglePin();
    }
  });

  // Answer style cycling
  globalShortcut.register(SHORTCUTS.CYCLE_ANSWER_STYLE, () => {
    const current = store.get('answerStyle') || ANSWER_STYLES[0];
    const currentIndex = ANSWER_STYLES.indexOf(current);
    const newStyle = ANSWER_STYLES[(currentIndex + 1) % ANSWER_STYLES.length];
    store.set('answerStyle', newStyle);
    notifyRenderer('answer-style-changed', newStyle);
  });

  // Model cycling
  globalShortcut.register(SHORTCUTS.CYCLE_MODEL, () => {
    const currentModel = store.get('defaultModel') || AI_PROVIDERS[0];
    const currentIndex = AI_PROVIDERS.indexOf(currentModel);
    const newModel = AI_PROVIDERS[(currentIndex + 1) % AI_PROVIDERS.length];
    store.set('defaultModel', newModel);
    notifyRenderer('model-changed', newModel);
  });

  // Full screenshot
  globalShortcut.register(SHORTCUTS.FULL_SCREENSHOT, async () => {
    try {
      const screenshotPath = await takeScreenshot(log);
      addScreenshot(screenshotPath, log);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('screenshot-taken', { path: screenshotPath });
      }
    } catch (error) {
      log.error('Error taking full screenshot:', error);
    }
  });

  // Region screenshot trigger
  globalShortcut.register(SHORTCUTS.REGION_SCREENSHOT, () => debounced('region-screenshot', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('trigger-region-screenshot');
  }));

  // Extract text from screenshots
  globalShortcut.register(SHORTCUTS.EXTRACT_TEXT, () => debounced('extract-text', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('extract-text-from-screenshots');
  }));

  // Clear screenshots
  globalShortcut.register(SHORTCUTS.CLEAR_SCREENSHOTS, async () => {
    await clearScreenshots(log);
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('screenshots-cleared');
  });

  // Process screenshots
  globalShortcut.register(SHORTCUTS.PROCESS_SCREENSHOTS, () => debounced('process-screenshots', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('process-screenshots');
  }));

  // Process clipboard prompt
  globalShortcut.register(SHORTCUTS.PROCESS_CLIPBOARD, () => debounced('process-clipboard', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('process-clipboard-prompt');
  }));

  // Copy latest AI response
  globalShortcut.register(SHORTCUTS.COPY_RESPONSE, () => debounced('copy-response', () => {
    const latestResponse = getLatestAIResponse();
    if (latestResponse) clipboard.writeText(latestResponse);
  }));

  // Arrow key shortcuts for window movement and content scrolling
  ['Up', 'Down', 'Left', 'Right'].forEach(dir => {
    globalShortcut.register(`CommandOrControl+Shift+${dir}`, () => 
      moveWindow(dir.toLowerCase() as 'up' | 'down' | 'left' | 'right')
    );
    globalShortcut.register(`CommandOrControl+${dir}`, () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('scroll-content', { direction: dir.toLowerCase() });
    });
  });

  // Overlay corner positioning
  globalShortcut.register(SHORTCUTS.OVERLAY_MOVE_LEFT, () => {
    if (overlayManager.getState().isVisible) overlayManager.moveToCorner('bottom-left');
  });

  globalShortcut.register(SHORTCUTS.OVERLAY_MOVE_RIGHT, () => {
    if (overlayManager.getState().isVisible) overlayManager.moveToCorner('bottom-right');
  });

  // Tab navigation
  globalShortcut.register(SHORTCUTS.TAB_NEXT, () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('switch-tab', 'next');
  });

  globalShortcut.register(SHORTCUTS.TAB_PREVIOUS, () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('switch-tab', 'previous');
  });

  // Developer tools
  globalShortcut.register(SHORTCUTS.DEV_TOOLS, () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

  log.info('Global shortcuts registered');
}

export function unregisterAllShortcuts() {
  globalShortcut.unregisterAll();
}
