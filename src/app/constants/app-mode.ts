/**
 * App modes offered by the launch picker.
 *
 *  exam      — the stealth overlay: click-through window, screenshots, OCR,
 *              multi-provider side-by-side answers, floating overlay bubble.
 *  interview — a floating assistant for live calls: listens to the call audio,
 *              answers or helps on demand (EN / VI) and keeps meeting notes.
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
    title: 'Interview & Meetings',
    tagline: 'Live answers and meeting notes.',
    points: [
      'Listens to the call and transcribes it as it goes',
      'Answers questions and suggests what to say (EN / VI)',
      'Writes meeting notes: summary, decisions, action items',
    ],
    hotkey: '2',
  },
];
