/**
 * App modes offered by the launch picker.
 *
 *  exam      — the stealth overlay: click-through window, screenshots, OCR,
 *              multi-provider side-by-side answers, floating overlay bubble.
 *  interview — a readable, always-interactive panel that listens to the call
 *              audio and streams spoken-style answers in real time (EN / VI).
 */
export const APP_MODE = {
  EXAM: 'exam',
  INTERVIEW: 'interview',
} as const;

export type AppMode = typeof APP_MODE[keyof typeof APP_MODE];

export interface AppModeOption {
  id: AppMode;
  title: string;
  tagline: string;
  points: string[];
  hotkey: string;
}

export const APP_MODE_OPTIONS: AppModeOption[] = [
  {
    id: APP_MODE.EXAM,
    title: 'Exam',
    tagline: 'Invisible overlay. Hotkeys only.',
    points: [
      'Click-through window, hidden from screen capture',
      'Screenshot / region / OCR → answer',
      'Compare several AI providers side by side',
    ],
    hotkey: '1',
  },
  {
    id: APP_MODE.INTERVIEW,
    title: 'Interview',
    tagline: 'Live answers while you talk.',
    points: [
      'Listens to the call and transcribes each question',
      'Streams what to say, in English or Vietnamese',
      'Large, readable layout — still hidden from screen share',
    ],
    hotkey: '2',
  },
];
