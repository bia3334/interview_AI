// path: src/main/ipc/shortcuts.ts
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { EDITABLE_SHORTCUTS, RESERVED_ACCELERATORS } from '../constants/shortcuts';
import { getResolvedShortcuts, unregisterAllShortcuts } from '../shortcuts';

const MODIFIER_TOKENS = new Set([
  'command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl',
  'alt', 'option', 'altgr', 'shift', 'super', 'meta',
]);

/**
 * Normalize an accelerator for order-insensitive, case-insensitive comparison
 * (e.g. "CommandOrControl+Shift+A" === "shift+commandorcontrol+a").
 */
function normalizeAccelerator(accelerator: string): string {
  return accelerator
    .split('+')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+');
}

/** A valid global shortcut needs at least one modifier and exactly one key. */
function validateAccelerator(accelerator: string): string | null {
  const tokens = accelerator.split('+').map(t => t.trim()).filter(Boolean);
  if (tokens.length < 2) {
    return 'A shortcut must combine a modifier (Ctrl/Cmd, Shift or Alt) with another key.';
  }
  const modifiers = tokens.filter(t => MODIFIER_TOKENS.has(t.toLowerCase()));
  const keys = tokens.filter(t => !MODIFIER_TOKENS.has(t.toLowerCase()));
  if (modifiers.length === 0) {
    return 'A shortcut must include at least one modifier (Ctrl/Cmd, Shift or Alt).';
  }
  if (keys.length !== 1) {
    return 'A shortcut must include exactly one non-modifier key.';
  }
  return null;
}

export function registerShortcutsIPC(
  ipcMain: IpcMain,
  deps: {
    store: { get: (k: string, d?: any) => any; set: (k: string, v: any) => void };
    log: { info: (...args: any[]) => void; error: (...args: any[]) => void };
    reapplyShortcuts: () => string[];
  }
) {
  const { store, log, reapplyShortcuts } = deps;

  ipcMain.handle('getShortcuts', () => {
    try {
      return { success: true, shortcuts: getResolvedShortcuts(store as any) };
    } catch (error: any) {
      log.error('Error getting shortcuts:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('saveShortcut', (_event: IpcMainInvokeEvent, id: string, accelerator: string) => {
    try {
      const def = EDITABLE_SHORTCUTS.find(s => s.id === id);
      if (!def) {
        return { success: false, error: `Unknown shortcut "${id}".` };
      }

      const validationError = validateAccelerator(accelerator);
      if (validationError) {
        return { success: false, error: validationError };
      }

      const normalized = normalizeAccelerator(accelerator);

      // Conflict with a fixed (non-editable) binding.
      if (RESERVED_ACCELERATORS.some(a => normalizeAccelerator(a) === normalized)) {
        return { success: false, error: 'That combination is reserved by the app and cannot be reused.' };
      }

      // Conflict with another editable shortcut's current binding.
      const resolved = getResolvedShortcuts(store as any);
      const clash = resolved.find(s => s.id !== id && normalizeAccelerator(s.accelerator) === normalized);
      if (clash) {
        return { success: false, error: `Already used by "${clash.label}".` };
      }

      const previousOverrides = store.get('shortcutOverrides') || {};
      const overrides: Record<string, string> = { ...previousOverrides };
      // Drop the override entirely when it matches the default — keeps the
      // store clean and lets the default track future changes.
      if (normalizeAccelerator(def.defaultAccelerator) === normalized) {
        delete overrides[id];
      } else {
        overrides[id] = accelerator;
      }
      store.set('shortcutOverrides', overrides);

      const failedIds = reapplyShortcuts();
      if (failedIds && failedIds.includes(id)) {
        // Rollback store overrides
        store.set('shortcutOverrides', previousOverrides);
        // Reapply working shortcuts
        reapplyShortcuts();
        return { success: false, error: `Failed to register shortcut "${accelerator}" (already in use by the OS or another app).` };
      }

      log.info(`Shortcut "${id}" rebound to "${accelerator}"`);
      return { success: true, shortcuts: getResolvedShortcuts(store as any) };
    } catch (error: any) {
      log.error('Error saving shortcut:', error);
      return { success: false, error: error.message };
    }
  });

  // While the Settings UI is capturing a new key combination, suspend all
  // global shortcuts so the keystrokes reach the renderer instead of firing
  // their bound action OS-wide. Re-applies the bindings when capture ends.
  ipcMain.handle('setShortcutCapture', (_event: IpcMainInvokeEvent, active: boolean) => {
    try {
      if (active) {
        unregisterAllShortcuts();
      } else {
        reapplyShortcuts();
      }
      return { success: true };
    } catch (error: any) {
      log.error('Error toggling shortcut capture mode:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('resetShortcuts', () => {
    try {
      store.set('shortcutOverrides', {});
      reapplyShortcuts();
      log.info('Shortcuts reset to defaults');
      return { success: true, shortcuts: getResolvedShortcuts(store as any) };
    } catch (error: any) {
      log.error('Error resetting shortcuts:', error);
      return { success: false, error: error.message };
    }
  });
}
