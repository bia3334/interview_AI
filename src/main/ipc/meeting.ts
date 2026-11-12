/**
 * Saved meeting / interview sessions (notes + transcript + assistant answers).
 *
 * One JSON file per session under `<userData>/meetings/`, so a long transcript
 * never bloats the preferences store and a session survives a crash: the
 * renderer saves after every notes update, not only when the call ends.
 */
import type { Dialog, IpcMain, IpcMainInvokeEvent } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import {
  formatSessionMarkdown,
  isSafeSessionId,
  MeetingSession,
  MeetingSessionSummary,
  normalizeSession,
  summarizeSession,
} from '../ai/meeting';

type LogLike = { info: (...args: any[]) => void; error: (...args: any[]) => void };

/** Oldest sessions beyond this count are deleted when a new one is saved. */
export const MAX_SAVED_SESSIONS = 100;

function sessionFile(dir: string, id: string): string {
  return path.join(dir, `${id}.json`);
}

export function readSession(dir: string, id: string): MeetingSession | null {
  if (!isSafeSessionId(id)) return null;
  try {
    return normalizeSession(JSON.parse(fs.readFileSync(sessionFile(dir, id), 'utf8')));
  } catch {
    return null;
  }
}

/** Newest first. Unreadable files are skipped rather than failing the list. */
export function listSessions(dir: string): MeetingSessionSummary[] {
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  const sessions: MeetingSessionSummary[] = [];
  for (const name of names) {
    const session = readSession(dir, name.slice(0, -'.json'.length));
    if (session) sessions.push(summarizeSession(session));
  }
  return sessions.sort((a, b) => b.startedAt - a.startedAt);
}

export function writeSession(dir: string, value: unknown): MeetingSession {
  const session = normalizeSession(value);
  if (!session) throw new Error('Invalid session');
  session.updatedAt = Date.now();
  fs.mkdirSync(dir, { recursive: true });
  // Write-then-rename so a crash mid-write cannot leave a truncated session.
  const target = sessionFile(dir, session.id);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(session), 'utf8');
  fs.renameSync(tmp, target);

  const all = listSessions(dir);
  for (const old of all.slice(MAX_SAVED_SESSIONS)) {
    try { fs.unlinkSync(sessionFile(dir, old.id)); } catch { /* already gone */ }
  }
  return session;
}

export function deleteSession(dir: string, id: string): boolean {
  if (!isSafeSessionId(id)) return false;
  try {
    fs.unlinkSync(sessionFile(dir, id));
    return true;
  } catch {
    return false;
  }
}

function exportFileName(session: MeetingSession): string {
  const d = new Date(session.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const slug = session.title
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${date}-${slug || session.kind}.md`;
}

export function registerMeetingIPC(
  ipcMain: IpcMain,
  deps: { log: LogLike; dialog: Dialog; getSessionsDir: () => string }
) {
  const { log, dialog, getSessionsDir } = deps;

  ipcMain.handle('listMeetingSessions', () => {
    try {
      return { success: true, data: listSessions(getSessionsDir()) };
    } catch (error: any) {
      log.error('listMeetingSessions error:', error);
      return { success: false, error: error.message || 'Failed to list sessions' };
    }
  });

  ipcMain.handle('getMeetingSession', (_event: IpcMainInvokeEvent, id: string) => {
    try {
      const session = readSession(getSessionsDir(), id);
      return session ? { success: true, data: session } : { success: false, error: 'Session not found' };
    } catch (error: any) {
      log.error('getMeetingSession error:', error);
      return { success: false, error: error.message || 'Failed to load session' };
    }
  });

  ipcMain.handle('saveMeetingSession', (_event: IpcMainInvokeEvent, session: MeetingSession) => {
    try {
      return { success: true, data: summarizeSession(writeSession(getSessionsDir(), session)) };
    } catch (error: any) {
      log.error('saveMeetingSession error:', error);
      return { success: false, error: error.message || 'Failed to save session' };
    }
  });

  ipcMain.handle('deleteMeetingSession', (_event: IpcMainInvokeEvent, id: string) => {
    try {
      return deleteSession(getSessionsDir(), id)
        ? { success: true }
        : { success: false, error: 'Session not found' };
    } catch (error: any) {
      log.error('deleteMeetingSession error:', error);
      return { success: false, error: error.message || 'Failed to delete session' };
    }
  });

  /** Save dialog → one Markdown file with notes, answers and transcript. */
  ipcMain.handle('exportMeetingSession', async (_event: IpcMainInvokeEvent, value: MeetingSession) => {
    try {
      const session = normalizeSession(value);
      if (!session) return { success: false, error: 'Invalid session' };
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Export notes',
        defaultPath: exportFileName(session),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (canceled || !filePath) return { success: true, data: { canceled: true } };
      fs.writeFileSync(filePath, formatSessionMarkdown(session), 'utf8');
      log.info(`Session ${session.id} exported to ${path.basename(filePath)}`);
      return { success: true, data: { canceled: false, filePath } };
    } catch (error: any) {
      log.error('exportMeetingSession error:', error);
      return { success: false, error: error.message || 'Failed to export notes' };
    }
  });
}
