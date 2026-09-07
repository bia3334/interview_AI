/**
 * Interview-mode background context: the candidate's CV, the job description
 * and free notes. Kept separate from the exam-mode document library because
 * an interview needs all three at once, and they describe *me* rather than
 * the material being examined.
 *
 * This module is pure (no Electron imports) so the prefix builder can be unit
 * tested; persistence and file import live in ipc/interview-context.ts.
 */

export type InterviewContextSlot = 'cv' | 'jd' | 'notes';

export interface InterviewContextEntry {
  text: string;
  /** Name of the imported file, or null when the text was pasted/typed. */
  fileName: string | null;
  updatedAt: number;
}

export type InterviewContext = Record<InterviewContextSlot, InterviewContextEntry>;

export const INTERVIEW_CONTEXT_SLOTS: InterviewContextSlot[] = ['cv', 'jd', 'notes'];

/** Per-slot character caps so a long CV or JD cannot crowd out the question. */
export const INTERVIEW_CONTEXT_LIMITS: Record<InterviewContextSlot, number> = {
  cv: 15000,
  jd: 10000,
  notes: 6000,
};

const emptyEntry = (): InterviewContextEntry => ({ text: '', fileName: null, updatedAt: 0 });

export const emptyInterviewContext = (): InterviewContext => ({
  cv: emptyEntry(),
  jd: emptyEntry(),
  notes: emptyEntry(),
});

function normalizeEntry(value: unknown): InterviewContextEntry {
  if (!value || typeof value !== 'object') return emptyEntry();
  const v = value as Record<string, unknown>;
  return {
    text: typeof v['text'] === 'string' ? v['text'] : '',
    fileName: typeof v['fileName'] === 'string' && v['fileName'] ? v['fileName'] : null,
    updatedAt: typeof v['updatedAt'] === 'number' ? v['updatedAt'] : 0,
  };
}

/** Coerce whatever is in the store into a well-formed context. */
export function normalizeInterviewContext(value: unknown): InterviewContext {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    cv: normalizeEntry(v['cv']),
    jd: normalizeEntry(v['jd']),
    notes: normalizeEntry(v['notes']),
  };
}

export function hasInterviewContext(ctx: InterviewContext): boolean {
  return INTERVIEW_CONTEXT_SLOTS.some((slot) => ctx[slot].text.trim().length > 0);
}

function clip(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}\n[truncated: ${trimmed.length - limit} more characters]`;
}

/**
 * Prompt prefix placed ahead of the interview question. Empty string when no
 * slot has text, so callers can drop it without a check.
 */
export function buildInterviewContextPrefix(ctx: InterviewContext): string {
  if (!hasInterviewContext(ctx)) return '';

  const parts: string[] = [
    'Background for this interview. Ground every answer in it: speak as the candidate described in the CV, cite real experience from it, and match what the job description asks for. Never invent facts about me; if a question is about something not covered here, answer from general knowledge without claiming it is on my CV.',
  ];

  const section = (title: string, entry: InterviewContextEntry, limit: number) => {
    if (!entry.text.trim()) return;
    const label = entry.fileName ? `${title} (${entry.fileName})` : title;
    parts.push(['', `--- ${label} ---`, clip(entry.text, limit), `--- END ${title} ---`].join('\n'));
  };

  section('MY CV', ctx.cv, INTERVIEW_CONTEXT_LIMITS.cv);
  section('JOB DESCRIPTION', ctx.jd, INTERVIEW_CONTEXT_LIMITS.jd);
  section('MY NOTES', ctx.notes, INTERVIEW_CONTEXT_LIMITS.notes);

  return parts.join('\n');
}
