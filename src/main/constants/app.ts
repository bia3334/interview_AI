/**
 * Application-wide configuration constants
 */

/** App name used for temp directories, etc. */
export const APP_NAME = 'open-interview-coder';

/** Maximum screenshots to keep in queue */
export const MAX_SCREENSHOTS = 5;

/** Window movement step in pixels */
export const WINDOW_MOVE_STEP = 200;

/** Default window configuration */
export const DEFAULT_WINDOW = {
  position: { x: 100, y: 100 },
  size: { width: 1600, height: 1200 },
} as const;

/** IPC channel names */
export const IPC_CHANNELS = {
  // Window
  CLOSE_WINDOW: 'close-window',
  HIDE_WINDOW: 'hide-window',
  SHOW_WINDOW: 'show-window',
  MOVE_WINDOW: 'move-window',
  WINDOW_SHOWN: 'window-shown',
  
  // Screenshots
  TAKE_SCREENSHOT: 'take-screenshot',
  TAKE_REGION_SCREENSHOT: 'take-region-screenshot',
  GET_SCREENSHOTS: 'get-screenshots',
  REMOVE_SCREENSHOT: 'remove-screenshot',
  IMPORT_CLIPBOARD_IMAGE: 'import-clipboard-image',
  SCREENSHOT_TAKEN: 'screenshot-taken',
  SCREENSHOTS_CLEARED: 'screenshots-cleared',
  TRIGGER_REGION_SCREENSHOT: 'trigger-region-screenshot',
  
  // AI
  SEND_PROMPT_TO_OPENAI: 'sendPromptToOpenAI',
  SEND_PROMPT_TO_GEMINI: 'sendPromptToGemini',
  SEND_CONVERSATION_TO_OPENAI: 'sendConversationToOpenAI',
  SEND_CONVERSATION_TO_GEMINI: 'sendConversationToGemini',
  ANALYZE_SCREENSHOTS: 'analyze-screenshots',
  EXTRACT_TEXT: 'extractTextFromScreenshots',
  PROCESS_CLIPBOARD_PROMPT: 'processClipboardPrompt',
  COPY_LATEST_RESPONSE: 'copy-latest-response',
  
  // Events from main to renderer
  TOAST: 'toast',
  SWITCH_TAB: 'switch-tab',
  SCROLL_CONTENT: 'scroll-content',
  ANSWER_STYLE_CHANGED: 'answer-style-changed',
  MODEL_CHANGED: 'model-changed',
  PROCESS_SCREENSHOTS: 'process-screenshots',
  EXTRACT_TEXT_FROM_SCREENSHOTS: 'extract-text-from-screenshots',
  PROCESS_CLIPBOARD: 'process-clipboard-prompt',
} as const;
