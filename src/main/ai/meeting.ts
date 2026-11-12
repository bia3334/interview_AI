/**
 * Meeting assistant: prompts for the quick actions (assist / what to say /
 * follow-ups / recap), the rolling meeting notes, and the saved-session
 * format.
 *
 * Pure module (no Electron imports) so it can be unit tested; the IPC and
 * file persistence live in ipc/meeting.ts and ipc/ai.ts.
 */

/** What the live session is: a job interview (I am the candidate) or a meeting. */
export type SessionKind = 'interview' | 'meeting';

/**
 * What the assistant is asked to do with the conversation:
 *  answer    — answer the question that was just asked (or one I typed)
 *  assist    — look at the last few lines and give the most useful help now
 *  say-next  — suggest what I could say next
 *  follow-up — questions I could ask
 *  recap     — short recap of the conversation so far
 */
export type AssistAction = 'answer' | 'assist' | 'say-next' | 'follow-up' | 'recap';

export type AssistLanguage = 'auto' | 'en' | 'vi';

export const SESSION_KINDS: SessionKind[] = ['interview', 'meeting'];
export const ASSIST_ACTIONS: AssistAction[] = ['answer', 'assist', 'say-next', 'follow-up', 'recap'];

/** Transcript characters sent with a quick action (the most recent ones). */
export const ASSIST_TRANSCRIPT_LIMIT = 6000;
/** Transcript characters sent with one notes update. */
export const NOTES_TRANSCRIPT_LIMIT = 24000;
/** Previous notes characters carried into the next notes update. */
export const NOTES_PREVIOUS_LIMIT = 8000;

export interface TranscriptLine {
  at: number;
  text: string;
}

export interface SessionQA {
  at: number;
  question: string;
  answer: string;
}

export interface MeetingSession {
  id: string;
  kind: SessionKind;
  title: string;
  startedAt: number;
  endedAt: number;
  /** Markdown notes written by the model. */
  notes: string;
  transcript: TranscriptLine[];
  qa: SessionQA[];
  updatedAt: number;
}

export interface MeetingSessionSummary {
  id: string;
  kind: SessionKind;
  title: string;
  startedAt: number;
  endedAt: number;
  lineCount: number;
  hasNotes: boolean;
}

export function normalizeSessionKind(value: unknown): SessionKind {
  return value === 'meeting' ? 'meeting' : 'interview';
}

export function normalizeAssistAction(value: unknown): AssistAction {
  return ASSIST_ACTIONS.includes(value as AssistAction) ? (value as AssistAction) : 'answer';
}

/** Keep the END of a long text (the latest part of a conversation). */
export function clipTail(text: string, limit: number): string {
  const trimmed = (text || '').trim();
  if (trimmed.length <= limit) return trimmed;
  const tail = trimmed.slice(trimmed.length - limit);
  // Start on a line boundary when one is close, so no line is cut in half.
  const nl = tail.indexOf('\n');
  return `[earlier part omitted]\n${nl > -1 && nl < 400 ? tail.slice(nl + 1) : tail}`;
}

function languageRule(language: AssistLanguage): string {
  if (language === 'en') return 'Write in English.';
  if (language === 'vi') return 'Viết bằng tiếng Việt tự nhiên; giữ nguyên thuật ngữ kỹ thuật bằng tiếng Anh.';
  return 'Write in the language the conversation is held in (English or Vietnamese). If it mixes both, write in Vietnamese and keep technical terms in English.';
}

const ACTION_TASKS: Record<AssistAction, (kind: SessionKind) => string> = {
  answer: () =>
    `Answer the question below directly. First line: the answer in one sentence. Then up to 4 short bullet points with the supporting detail.`,
  assist: (kind) =>
    kind === 'interview'
      ? `Look at the last few lines and give me the single most useful thing right now. If the interviewer asked me something, write what I should say as the candidate (one direct sentence, then 3-4 short first-person bullet points). If a term or concept came up, define it in one line first.`
      : `Look at the last few lines and give me the single most useful thing right now. If someone asked me something, write what I could answer. If a term, number or claim came up that needs explaining or checking, explain it in one or two lines. Otherwise give me the one point worth raising next.`,
  'say-next': (kind) =>
    kind === 'interview'
      ? `Suggest what I should say next as the candidate. Give 2 options, each one or two sentences I can say out loud as written, most natural one first.`
      : `Suggest what I should say next to move this conversation forward. Give 2-3 options, each one or two sentences I can say out loud as written, strongest one first.`,
  'follow-up': (kind) =>
    kind === 'interview'
      ? `Give me 3-4 thoughtful questions I could ask the interviewer, based on what was actually discussed. One line each, most insightful first.`
      : `Give me 3-5 sharp follow-up questions I could ask, based on what was actually discussed (unclear points, missing owners or dates, risks). One line each, most important first.`,
  recap: () =>
    `Recap the conversation so far in at most 6 short bullet points: what was discussed, what was decided, and what is still open. End with one line starting "Now:" that says what is being talked about at the moment.`,
};

/**
 * Prompt for a quick action over the live transcript. `question` is only used
 * by the `answer` action (typed by me, or the utterance being answered).
 */
export function generateAssistPrompt(args: {
  action: AssistAction;
  kind: SessionKind;
  transcript: string;
  question?: string;
  language: AssistLanguage;
  codeLanguage?: string;
  contextPrefix?: string;
}): string {
  const { action, kind } = args;
  const transcript = clipTail(args.transcript, ASSIST_TRANSCRIPT_LIMIT);
  const question = (args.question || '').trim();
  const role =
    kind === 'interview'
      ? 'You are my real-time interview assistant. I am the candidate in a live job interview.'
      : 'You are my real-time meeting assistant. I am a participant in a live meeting or call.';

  const parts: string[] = [role];
  parts.push(
    transcript
      ? `Live transcript so far (auto-transcribed from the call audio, most recent last; it may contain recognition errors and has no speaker labels, so infer who is speaking from the content):\n\n"""\n${transcript}\n"""`
      : 'Nothing has been transcribed yet.',
  );
  if (action === 'answer' && question) parts.push(`Question:\n"${question}"`);
  parts.push(ACTION_TASKS[action](kind));

  const rules = [
    languageRule(args.language),
    'Keep the whole reply under ~130 words so I can read it at a glance.',
    'No preamble, no headers, no notes about the transcription, no coaching commentary.',
    'Base everything on the transcript and the background provided. Never invent facts, names, numbers or commitments.',
  ];
  if (args.codeLanguage) {
    rules.push(`Only add a single short ${args.codeLanguage} code block if the question genuinely requires code.`);
  }
  if (!transcript && action !== 'answer') {
    rules.push('If there is nothing to work with yet, say so in one short line.');
  }
  parts.push(`Rules:\n${rules.map((r) => `- ${r}`).join('\n')}`);

  const body = parts.join('\n\n');
  return args.contextPrefix ? `${args.contextPrefix}\n\n${body}` : body;
}

const NOTES_SECTIONS: Record<SessionKind, string> = {
  meeting: [
    '## Summary — 2-4 sentences on what this meeting is about and where it stands.',
    '## Key points — the important things said, grouped by topic, one bullet each.',
    '## Decisions — what was agreed. Only real decisions.',
    '## Action items — task list items in the form "- [ ] Owner: task (due date if one was said)". Use "Unassigned" when no owner was named.',
    '## Open questions — what was raised and not resolved.',
  ].join('\n'),
  interview: [
    '## Summary — 2-4 sentences: the role, who is interviewing, how it is going.',
    '## Questions asked — each question the interviewer asked, in order, one bullet each, with a short note of how it was answered when the transcript shows it.',
    '## About the role and company — facts the interviewer shared (team, stack, process, expectations, compensation, timeline).',
    '## Follow-ups — things I promised to send or do, things to prepare or study, and next steps in the hiring process.',
  ].join('\n'),
};

/**
 * Prompt for the rolling notes. Each update gets the notes written so far and
 * only the transcript lines added since, and returns the full updated notes,
 * so the cost of an update does not grow with the length of the meeting.
 */
export function generateMeetingNotesPrompt(args: {
  kind: SessionKind;
  newTranscript: string;
  previousNotes?: string;
  language: AssistLanguage;
  /** Last update of the session: add a title and tidy the whole document. */
  final?: boolean;
  contextPrefix?: string;
}): string {
  const previous = clipTail(args.previousNotes || '', NOTES_PREVIOUS_LIMIT);
  const transcript = clipTail(args.newTranscript, NOTES_TRANSCRIPT_LIMIT);
  const subject = args.kind === 'interview' ? 'job interview (I am the candidate)' : 'meeting';

  const parts: string[] = [
    `You are my note-taker for a live ${subject}. Write the notes I would want to read afterwards.`,
  ];
  if (previous) {
    parts.push(`Notes written so far:\n\n"""\n${previous}\n"""`);
  }
  parts.push(
    transcript
      ? `${previous ? 'New transcript since those notes' : 'Transcript so far'} (auto-transcribed, may contain recognition errors, no speaker labels):\n\n"""\n${transcript}\n"""`
      : 'There is no new transcript since those notes.',
  );
  parts.push(
    `${previous ? 'Return the full updated notes: keep what is still true, merge in what is new, and correct anything the new transcript contradicts.' : 'Return the notes.'} Use Markdown with these sections, in this order, and leave out any section that has nothing in it:\n${NOTES_SECTIONS[args.kind]}`,
  );

  const rules = [
    languageRule(args.language),
    'Be specific: keep names, numbers, dates, product and technical terms exactly as said.',
    'Never invent content. If the transcript is too garbled to be sure of something, leave it out.',
    'Short bullets, no filler, no commentary about the transcript or about these instructions.',
    'Output only the notes.',
  ];
  if (args.final) {
    rules.unshift('This is the final version: start with a single "# " title line of at most 8 words naming the topic, then the sections. Remove duplicates and put the points in a sensible order.');
  } else {
    rules.unshift('Do not add a title line; start directly with the first section.');
  }
  parts.push(`Rules:\n${rules.map((r) => `- ${r}`).join('\n')}`);

  const body = parts.join('\n\n');
  return args.contextPrefix ? `${args.contextPrefix}\n\n${body}` : body;
}

/** Title from the notes' "# " line, else a dated fallback. */
export function deriveSessionTitle(notes: string, kind: SessionKind, startedAt: number): string {
  const match = /^#\s+(.+)$/m.exec(notes || '');
  const title = match ? match[1].replace(/[*_`#]/g, '').trim() : '';
  if (title) return title.slice(0, 120);
  const d = new Date(startedAt || Date.now());
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${kind === 'interview' ? 'Interview' : 'Meeting'} ${stamp}`;
}

function clock(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Transcript lines as "[HH:MM:SS] text", the form sent to the model. */
export function formatTranscript(lines: TranscriptLine[]): string {
  return lines.map((l) => `[${clock(l.at)}] ${l.text}`).join('\n');
}

/** One Markdown document for export: notes, then Q&A, then the transcript. */
export function formatSessionMarkdown(session: MeetingSession): string {
  const out: string[] = [];
  const notes = (session.notes || '').trim();
  if (/^#\s+/m.test(notes)) {
    out.push(notes);
  } else {
    out.push(`# ${session.title}`);
    if (notes) out.push(notes);
  }

  const started = new Date(session.startedAt);
  const minutes = Math.max(0, Math.round((session.endedAt - session.startedAt) / 60000));
  out.push(`---\n\n_${session.kind === 'interview' ? 'Interview' : 'Meeting'} on ${started.toLocaleString()} · ${minutes} min · ${session.transcript.length} transcript lines_`);

  if (session.qa.length > 0) {
    out.push('## Assistant answers');
    for (const item of session.qa) {
      out.push(`**${clock(item.at)} · ${item.question.replace(/\s+/g, ' ').trim()}**\n\n${item.answer.trim()}`);
    }
  }
  if (session.transcript.length > 0) {
    out.push(`## Transcript\n\n${session.transcript.map((l) => `- \`${clock(l.at)}\` ${l.text}`).join('\n')}`);
  }
  return `${out.join('\n\n')}\n`;
}

/** Coerce a parsed session file into a well-formed session, or null. */
export function normalizeSession(value: unknown): MeetingSession | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, any>;
  if (typeof v['id'] !== 'string' || !isSafeSessionId(v['id'])) return null;
  const num = (x: unknown, d: number) => (typeof x === 'number' && isFinite(x) ? x : d);
  const startedAt = num(v['startedAt'], Date.now());
  const kind = normalizeSessionKind(v['kind']);
  const notes = typeof v['notes'] === 'string' ? v['notes'] : '';
  const transcript: TranscriptLine[] = Array.isArray(v['transcript'])
    ? v['transcript']
        .filter((l: any) => l && typeof l.text === 'string' && l.text.trim())
        .map((l: any) => ({ at: num(l.at, startedAt), text: String(l.text) }))
    : [];
  const qa: SessionQA[] = Array.isArray(v['qa'])
    ? v['qa']
        .filter((q: any) => q && typeof q.question === 'string' && typeof q.answer === 'string')
        .map((q: any) => ({ at: num(q.at, startedAt), question: q.question, answer: q.answer }))
    : [];
  return {
    id: v['id'],
    kind,
    title: typeof v['title'] === 'string' && v['title'].trim()
      ? v['title'].trim().slice(0, 120)
      : deriveSessionTitle(notes, kind, startedAt),
    startedAt,
    endedAt: num(v['endedAt'], startedAt),
    notes,
    transcript,
    qa,
    updatedAt: num(v['updatedAt'], startedAt),
  };
}

/** Session ids become file names, so only a conservative alphabet is allowed. */
export function isSafeSessionId(id: unknown): id is string {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
}

export function summarizeSession(session: MeetingSession): MeetingSessionSummary {
  return {
    id: session.id,
    kind: session.kind,
    title: session.title,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    lineCount: session.transcript.length,
    hasNotes: session.notes.trim().length > 0,
  };
}
