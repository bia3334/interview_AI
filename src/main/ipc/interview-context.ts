/**
 * Interview context IPC: read / save / import the candidate's CV, the job
 * description and notes. Persisted in electron-store under `interviewContext`.
 */
import type { Dialog, IpcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import { readDocumentContent } from '../utils/files';
import {
  INTERVIEW_CONTEXT_SLOTS,
  InterviewContext,
  InterviewContextSlot,
  normalizeInterviewContext,
} from '../ai/interview-context';

const STORE_KEY = 'interviewContext';

type StoreLike = { get: (k: string, d?: any) => any; set: (k: string, v: any) => void };
type LogLike = { info: (...args: any[]) => void; error: (...args: any[]) => void; warn?: (...args: any[]) => void };

export type InterviewContextPatch = Partial<Record<InterviewContextSlot, { text: string; fileName?: string | null }>>;

const SLOT_TITLES: Record<InterviewContextSlot, string> = {
  cv: 'Select your CV',
  jd: 'Select the job description',
  notes: 'Select a notes file',
};

function isSlot(value: unknown): value is InterviewContextSlot {
  return INTERVIEW_CONTEXT_SLOTS.includes(value as InterviewContextSlot);
}

export function getInterviewContext(store: StoreLike): InterviewContext {
  return normalizeInterviewContext(store.get(STORE_KEY));
}

export function saveInterviewContext(store: StoreLike, patch: InterviewContextPatch): InterviewContext {
  const ctx = getInterviewContext(store);
  const now = Date.now();
  for (const slot of INTERVIEW_CONTEXT_SLOTS) {
    const entry = patch[slot];
    if (!entry || typeof entry !== 'object') continue;
    const text = typeof entry.text === 'string' ? entry.text : '';
    ctx[slot] = {
      text,
      fileName: text.trim() && typeof entry.fileName === 'string' && entry.fileName ? entry.fileName : null,
      updatedAt: now,
    };
  }
  store.set(STORE_KEY, ctx);
  return ctx;
}

export function registerInterviewContextIPC(
  ipcMain: IpcMain,
  deps: { store: StoreLike; log: LogLike; dialog: Dialog }
) {
  const { store, log, dialog } = deps;

  ipcMain.handle('getInterviewContext', () => {
    try {
      return { success: true, data: getInterviewContext(store) };
    } catch (error: any) {
      log.error('getInterviewContext error:', error);
      return { success: false, error: error.message || 'Failed to load interview context' };
    }
  });

  ipcMain.handle('saveInterviewContext', (_event: IpcMainInvokeEvent, patch: InterviewContextPatch) => {
    try {
      const ctx = saveInterviewContext(store, patch || {});
      log.info(`Interview context saved (${INTERVIEW_CONTEXT_SLOTS.filter((s) => ctx[s].text.trim()).join(', ') || 'empty'})`);
      return { success: true, data: ctx };
    } catch (error: any) {
      log.error('saveInterviewContext error:', error);
      return { success: false, error: error.message || 'Failed to save interview context' };
    }
  });

  /** Native file picker → text extraction (pdf/docx/txt/md) → store. */
  ipcMain.handle('importInterviewContextFile', async (_event: IpcMainInvokeEvent, slot: InterviewContextSlot) => {
    try {
      if (!isSlot(slot)) return { success: false, error: `Unknown context slot: ${slot}` };
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: SLOT_TITLES[slot],
        properties: ['openFile'],
        filters: [
          { name: 'Documents', extensions: ['pdf', 'docx', 'txt', 'md'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });
      if (canceled || filePaths.length === 0) return { success: true, data: { canceled: true } };

      const filePath = filePaths[0];
      const fileName = path.basename(filePath);
      const text = (await readDocumentContent(filePath)).trim();
      if (!text) return { success: false, error: `Could not extract any text from ${fileName}` };

      const ctx = saveInterviewContext(store, { [slot]: { text, fileName } });
      log.info(`Interview context ${slot} imported from ${fileName} (${text.length} chars)`);
      return { success: true, data: { canceled: false, entry: ctx[slot] } };
    } catch (error: any) {
      log.error('importInterviewContextFile error:', error);
      return { success: false, error: error.message || 'Failed to import file' };
    }
  });
}
