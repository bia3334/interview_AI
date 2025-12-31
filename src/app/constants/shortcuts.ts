/**
 * Keyboard shortcuts for display in the UI
 * These should match the actual shortcuts defined in main/constants/shortcuts.ts
 */

export interface ShortcutInfo {
  action: string;
  keys: string[];
}

export const SHORTCUTS: ShortcutInfo[] = [
  { action: 'Toggle Window Visibility', keys: ['Ctrl/Cmd', 'Shift', 'A'] },
  { action: 'Toggle Mouse Events', keys: ['Ctrl/Cmd', 'Shift', 'W'] },
  { action: 'Toggle Overlay', keys: ['Ctrl/Cmd', 'Shift', 'O'] },
  { action: 'Take Full Screenshot', keys: ['Ctrl/Cmd', 'Shift', 'S'] },
  { action: 'Take Region Screenshot', keys: ['Ctrl/Cmd', 'Shift', 'Z'] },
  { action: 'Extract Text from Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'X'] },
  { action: 'Process Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'P'] },
  { action: 'Delete All Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'D'] },
  { action: 'Process Clipboard as Prompt', keys: ['Ctrl/Cmd', 'Shift', 'Q'] },
  { action: 'Copy Response to Clipboard', keys: ['Ctrl/Cmd', 'Shift', 'C'] },
  { action: 'Cycle Answer Style', keys: ['Ctrl/Cmd', 'Shift', 'L'] },
  { action: 'Cycle AI Model', keys: ['Ctrl/Cmd', 'Shift', 'M'] },
  { action: 'Next Tab', keys: ['Ctrl/Cmd', 'Shift', 'Space'] },
  { action: 'Previous Tab', keys: ['Ctrl/Cmd', 'Shift', 'Tab'] },
];
