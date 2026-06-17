/**
 * Global keyboard shortcuts configuration
 * 
 * Modify shortcuts here to change them throughout the app.
 * Format: 'CommandOrControl+Shift+Key' or 'CommandOrControl+Key'
 */

export const SHORTCUTS = {
  // Window controls
  TOGGLE_MOUSE_EVENTS: 'CommandOrControl+Shift+W',
  TOGGLE_WINDOW: 'CommandOrControl+Shift+A',

  // Panic: instantly wipe sensitive in-memory/on-disk data and quit
  PANIC: 'CommandOrControl+Shift+Backspace',
  
  // Overlay
  TOGGLE_OVERLAY: 'CommandOrControl+Shift+O',
  OVERLAY_MOVE_LEFT: 'CommandOrControl+Left',
  OVERLAY_MOVE_RIGHT: 'CommandOrControl+Right',
  
  // Screenshots
  FULL_SCREENSHOT: 'CommandOrControl+Shift+S',
  REGION_SCREENSHOT: 'CommandOrControl+Shift+Z',
  CLEAR_SCREENSHOTS: 'CommandOrControl+Shift+D',
  PROCESS_SCREENSHOTS: 'CommandOrControl+Shift+P',
  EXTRACT_TEXT: 'CommandOrControl+Shift+X',
  
  // Clipboard
  PROCESS_CLIPBOARD: 'CommandOrControl+Shift+Q',
  COPY_RESPONSE: 'CommandOrControl+Shift+C',

  // Voice
  TOGGLE_VOICE_RECORDING: 'CommandOrControl+Shift+V',
  
  // Window movement (with Shift)
  MOVE_UP: 'CommandOrControl+Shift+Up',
  MOVE_DOWN: 'CommandOrControl+Shift+Down',
  MOVE_LEFT: 'CommandOrControl+Shift+Left',
  MOVE_RIGHT: 'CommandOrControl+Shift+Right',
  
  // Content scrolling (without Shift)
  SCROLL_UP: 'CommandOrControl+Up',
  SCROLL_DOWN: 'CommandOrControl+Down',
  SCROLL_LEFT: 'CommandOrControl+Left',
  SCROLL_RIGHT: 'CommandOrControl+Right',
  
  // Developer
  DEV_TOOLS: 'CommandOrControl+Shift+I',
} as const;

export type ShortcutKey = keyof typeof SHORTCUTS;
export type ShortcutValue = typeof SHORTCUTS[ShortcutKey];

/**
 * Metadata for a user-rebindable global shortcut.
 * `id` is the stable key used in the store's `shortcutOverrides` map.
 */
export interface ShortcutDefinition {
  id: string;
  label: string;
  defaultAccelerator: string;
}

/**
 * The shortcuts the user can rebind from Settings. The order here is the
 * order shown in the UI. Anything not listed here (window movement arrows,
 * overlay corner positioning, dev tools) stays fixed and is treated as
 * reserved for conflict detection — see RESERVED_ACCELERATORS.
 */
export const EDITABLE_SHORTCUTS: ShortcutDefinition[] = [
  { id: 'TOGGLE_WINDOW', label: 'Toggle Window Visibility', defaultAccelerator: SHORTCUTS.TOGGLE_WINDOW },
  { id: 'TOGGLE_MOUSE_EVENTS', label: 'Toggle Mouse Events (Click-Through)', defaultAccelerator: SHORTCUTS.TOGGLE_MOUSE_EVENTS },
  { id: 'TOGGLE_OVERLAY', label: 'Toggle Overlay Bubble', defaultAccelerator: SHORTCUTS.TOGGLE_OVERLAY },
  { id: 'FULL_SCREENSHOT', label: 'Take Full Screenshot', defaultAccelerator: SHORTCUTS.FULL_SCREENSHOT },
  { id: 'REGION_SCREENSHOT', label: 'Take Region Screenshot', defaultAccelerator: SHORTCUTS.REGION_SCREENSHOT },
  { id: 'EXTRACT_TEXT', label: 'Extract Text from Screenshots', defaultAccelerator: SHORTCUTS.EXTRACT_TEXT },
  { id: 'PROCESS_SCREENSHOTS', label: 'Analyze Screenshots with AI', defaultAccelerator: SHORTCUTS.PROCESS_SCREENSHOTS },
  { id: 'CLEAR_SCREENSHOTS', label: 'Delete All Screenshots', defaultAccelerator: SHORTCUTS.CLEAR_SCREENSHOTS },
  { id: 'PROCESS_CLIPBOARD', label: 'Process Clipboard as Prompt', defaultAccelerator: SHORTCUTS.PROCESS_CLIPBOARD },
  { id: 'COPY_RESPONSE', label: 'Copy Response to Clipboard', defaultAccelerator: SHORTCUTS.COPY_RESPONSE },
  { id: 'TOGGLE_VOICE_RECORDING', label: 'Toggle Voice Recording', defaultAccelerator: SHORTCUTS.TOGGLE_VOICE_RECORDING },
  { id: 'PANIC', label: 'Panic (wipe data & quit)', defaultAccelerator: SHORTCUTS.PANIC },
];

/**
 * Accelerators that are registered but NOT user-editable. A user rebinding
 * must not collide with these (otherwise the fixed binding silently wins or
 * registration fails). Kept in sync with the fixed registrations in
 * shortcuts.ts.
 */
export const RESERVED_ACCELERATORS: string[] = [
  SHORTCUTS.MOVE_UP,
  SHORTCUTS.MOVE_DOWN,
  SHORTCUTS.MOVE_LEFT,
  SHORTCUTS.MOVE_RIGHT,
  SHORTCUTS.OVERLAY_MOVE_LEFT,
  SHORTCUTS.OVERLAY_MOVE_RIGHT,
  SHORTCUTS.DEV_TOOLS,
];
