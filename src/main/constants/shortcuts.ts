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
  
  // Overlay
  TOGGLE_OVERLAY: 'CommandOrControl+Shift+O',
  OVERLAY_MOVE_LEFT: 'CommandOrControl+Left',
  OVERLAY_MOVE_RIGHT: 'CommandOrControl+Right',
  
  // Answer style & model
  CYCLE_ANSWER_STYLE: 'CommandOrControl+Shift+L',
  CYCLE_MODEL: 'CommandOrControl+Shift+M',
  
  // Screenshots
  FULL_SCREENSHOT: 'CommandOrControl+Shift+S',
  REGION_SCREENSHOT: 'CommandOrControl+Shift+Z',
  CLEAR_SCREENSHOTS: 'CommandOrControl+Shift+D',
  PROCESS_SCREENSHOTS: 'CommandOrControl+Shift+P',
  EXTRACT_TEXT: 'CommandOrControl+Shift+X',
  
  // Clipboard
  PROCESS_CLIPBOARD: 'CommandOrControl+Shift+Q',
  COPY_RESPONSE: 'CommandOrControl+Shift+C',
  
  // Navigation
  TAB_NEXT: 'CommandOrControl+Shift+Space',
  TAB_PREVIOUS: 'CommandOrControl+Shift+Tab',
  
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
} as const;

export type ShortcutKey = keyof typeof SHORTCUTS;
export type ShortcutValue = typeof SHORTCUTS[ShortcutKey];
