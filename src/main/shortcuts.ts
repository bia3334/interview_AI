/**
 * Global keyboard shortcuts registration
 */
import { app, clipboard, globalShortcut } from 'electron';

import { overlayManager } from './ipc/overlay';
import { addScreenshot, clearScreenshots, clearScreenshotsSync, takeScreenshot } from './ipc/screenshots';
import { getLatestAIResponse, setLatestAIResponse } from './ipc/ai';
import { getMainWindow, moveWindow, toggleMainWindow, toggleMouseEvents } from './window';
import { EDITABLE_SHORTCUTS, SHORTCUTS, ShortcutDefinition } from './constants/shortcuts';
import type { AppStore } from './store';

/**
 * Resolve the accelerator currently bound to an editable shortcut id: a
 * user override from the store if present, otherwise the built-in default.
 */
function resolveAccelerator(store: AppStore, def: ShortcutDefinition): string {
  const overrides = (store.get('shortcutOverrides') as Record<string, string>) || {};
  return overrides[def.id] || def.defaultAccelerator;
}

/**
 * Editable shortcuts with their currently-bound accelerators, for display in
 * the Settings UI.
 */
export function getResolvedShortcuts(store: AppStore): Array<{
  id: string;
  label: string;
  accelerator: string;
  defaultAccelerator: string;
}> {
  return EDITABLE_SHORTCUTS.map(def => ({
    id: def.id,
    label: def.label,
    accelerator: resolveAccelerator(store, def),
    defaultAccelerator: def.defaultAccelerator,
  }));
}

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
): string[] {
  const { store, log, preloadPath } = deps;

  // Handlers for every editable shortcut, keyed by its stable id. The actual
  // accelerator each is bound to is resolved from the store (user override or
  // default) in the registration loop below — so rebinding in Settings only
  // needs to update the store and re-run this function.
  const handlers: Record<string, () => void> = {
    // Panic: instantly wipe sensitive data and quit. Synchronous on purpose —
    // everything must be erased before app.exit() tears the process down. Not
    // debounced: a panic press must never be swallowed.
    PANIC: () => {
      try {
        setLatestAIResponse('');       // Drop the cached AI answer from memory
        overlayManager.setLatestResponse('');
        clipboard.clear();             // Remove any copied response/prompt
        clearScreenshotsSync(log);     // Delete all screenshots from disk + queue
      } catch (error) {
        log.error('Panic cleanup error:', error);
      } finally {
        app.exit(0);                   // Vanish immediately (skips will-quit)
      }
    },

    // Window controls
    TOGGLE_MOUSE_EVENTS: () => toggleMouseEvents(),
    TOGGLE_WINDOW: () => toggleMainWindow(store),

    // Overlay toggle
    TOGGLE_OVERLAY: () => {
      const state = overlayManager.getState();
      const latestResponse = getLatestAIResponse();
      if (state.isVisible) {
        overlayManager.hide();
        if (state.isPinned) overlayManager.togglePin();
      } else {
        overlayManager.show(latestResponse, preloadPath);
        if (!state.isPinned) overlayManager.togglePin();
      }
    },

    // Full screenshot
    FULL_SCREENSHOT: () => debounced('full-screenshot', async () => {
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
    }),

    // Region screenshot trigger
    REGION_SCREENSHOT: () => debounced('region-screenshot', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('trigger-region-screenshot');
    }),

    // Extract text from screenshots
    EXTRACT_TEXT: () => debounced('extract-text', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('extract-text-from-screenshots');
    }),

    // Clear screenshots
    CLEAR_SCREENSHOTS: () => debounced('clear-screenshots', async () => {
      await clearScreenshots(log);
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('screenshots-cleared');
    }),

    // Process screenshots
    PROCESS_SCREENSHOTS: () => debounced('process-screenshots', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('process-screenshots');
    }),

    // Process clipboard prompt
    PROCESS_CLIPBOARD: () => debounced('process-clipboard', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('process-clipboard-prompt');
    }),

    // Copy latest AI response
    COPY_RESPONSE: () => debounced('copy-response', () => {
      const latestResponse = getLatestAIResponse();
      if (latestResponse) clipboard.writeText(latestResponse);
    }),

    // Toggle voice recording
    TOGGLE_VOICE_RECORDING: () => debounced('voice-toggle', () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('toggle-voice-recording');
    }),
  };

  const failedShortcutIds: string[] = [];

  // Register each editable shortcut at its currently-bound accelerator.
  EDITABLE_SHORTCUTS.forEach(def => {
    const handler = handlers[def.id];
    if (!handler) {
      log.error(`No handler defined for shortcut "${def.id}"`);
      return;
    }
    const accelerator = resolveAccelerator(store, def);
    const ok = globalShortcut.register(accelerator, handler);
    if (!ok) {
      log.error(`Failed to register shortcut "${def.id}" at "${accelerator}" (already in use by the OS or another app)`);
      failedShortcutIds.push(def.id);
    }
  });

  // Arrow key shortcuts for window movement (Ctrl/Cmd+Shift+Arrow).
  // Note: plain Ctrl/Cmd+Left/Right are reserved for overlay corner
  // positioning below — don't register a conflicting scroll handler on them
  // (the previous 'scroll-content' message had no renderer listener anyway).
  ['Up', 'Down', 'Left', 'Right'].forEach(dir => {
    globalShortcut.register(`CommandOrControl+Shift+${dir}`, () =>
      moveWindow(dir.toLowerCase() as 'up' | 'down' | 'left' | 'right')
    );
  });

  // Overlay corner positioning (Ctrl/Cmd+Left / Ctrl/Cmd+Right)
  globalShortcut.register(SHORTCUTS.OVERLAY_MOVE_LEFT, () => {
    if (overlayManager.getState().isVisible) overlayManager.moveToCorner('bottom-left');
  });

  globalShortcut.register(SHORTCUTS.OVERLAY_MOVE_RIGHT, () => {
    if (overlayManager.getState().isVisible) overlayManager.moveToCorner('bottom-right');
  });

  // Developer tools
  globalShortcut.register(SHORTCUTS.DEV_TOOLS, () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.toggleDevTools();
  });

  log.info('Global shortcuts registered');
  return failedShortcutIds;
}

export function unregisterAllShortcuts() {
  globalShortcut.unregisterAll();
}
