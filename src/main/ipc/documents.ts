import * as path from 'path';
import { IpcMain, BrowserWindow } from 'electron';

// Active Document Context
let activeDocContext: string | null = null;
let activeDocPath: string | null = null;
const DOC_CONTEXT_MAX_CHARS = 1000000000000;

// Imported documents list
type ImportedDoc = { 
  filePath: string; 
  fileName: string; 
  length: number; 
  addedAt: number; 
  context: string 
};
const importedDocs: ImportedDoc[] = [];

/**
 * Set active document context
 */
export const setActiveDocContext = (
  text: string, 
  filePath: string | undefined, 
  mainWindow: BrowserWindow | null,
  log: any
) => {
  try {
    const truncated = text.length > DOC_CONTEXT_MAX_CHARS
      ? `${text.slice(0, DOC_CONTEXT_MAX_CHARS)}\n[Truncated document context]`
      : text;
    activeDocContext = truncated;
    activeDocPath = filePath || null;
    
    // Upsert into importedDocs list
    if (filePath) {
      const fileName = path.basename(filePath);
      const idx = importedDocs.findIndex((d) => d.filePath === filePath);
      if (idx >= 0) {
        importedDocs[idx] = { ...importedDocs[idx], context: truncated, length: truncated.length };
      } else {
        importedDocs.push({ filePath, fileName, length: truncated.length, addedAt: Date.now(), context: truncated });
      }
    }
    
    log.info('Active document context set', filePath ? `for: ${filePath}` : '');
    if (mainWindow && !mainWindow.isDestroyed()) {
      const name = filePath ? path.basename(filePath) : 'document';
      mainWindow.webContents.send('toast', `Document context loaded: ${name}`);
    }
  } catch (e) {
    log.warn('Failed setting active document context', e);
  }
};

/**
 * Clear active document context
 */
export const clearActiveDocContext = (mainWindow: BrowserWindow | null, log: any) => {
  activeDocContext = null;
  activeDocPath = null;
  log.info('Cleared active document context');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toast', 'Document context cleared');
  }
};

/**
 * Build document context prefix for AI prompts
 */
export const buildDocContextPrefix = () => {
  if (!activeDocContext) return '';
  const name = activeDocPath ? path.basename(activeDocPath) : 'document';
  return [
    `Use the following DOCUMENT CONTEXT as the primary reference. Prefer answers grounded in it before using screenshots or general knowledge. If the context doesn't cover the answer, say so briefly and proceed.`,
    '',
    `— Document: ${name}`,
    '--- DOCUMENT CONTEXT START ---',
    activeDocContext,
    '--- DOCUMENT CONTEXT END ---'
  ].join('\n');
};

/**
 * Get imported documents for UI
 */
export const getImportedDocsForUI = () => {
  return importedDocs.map((d) => ({
    filePath: d.filePath,
    fileName: d.fileName,
    length: d.length,
    addedAt: d.addedAt,
    active: !!activeDocPath && d.filePath === activeDocPath,
  }));
};

/**
 * Get active document info
 */
export const getActiveDocInfo = () => {
  if (!activeDocContext) return { hasContext: false };
  return {
    hasContext: true,
    fileName: activeDocPath ? path.basename(activeDocPath) : undefined,
    length: activeDocContext.length
  };
};

/**
 * Get imported document by path
 */
export const getImportedDoc = (filePath: string) => {
  return importedDocs.find((d) => d.filePath === filePath);
};

/**
 * Remove imported document
 */
export const removeImportedDoc = (filePath: string) => {
  const idx = importedDocs.findIndex((d) => d.filePath === filePath);
  if (idx < 0) return false;
  
  const wasActive = activeDocPath && importedDocs[idx].filePath === activeDocPath;
  importedDocs.splice(idx, 1);
  
  if (wasActive) {
    activeDocContext = null;
    activeDocPath = null;
  }
  
  return true;
};

/**
 * Register document context IPC handlers
 */
export function registerDocumentsIPC(
  ipcMain: IpcMain, 
  deps: { mainWindow: () => BrowserWindow | null; log: any }
) {
  ipcMain.handle('clearActiveDocContext', () => {
    clearActiveDocContext(deps.mainWindow(), deps.log);
    return { success: true };
  });

  ipcMain.handle('getActiveDocInfo', () => {
    return getActiveDocInfo();
  });

  ipcMain.handle('docs:list', () => {
    return { success: true, docs: getImportedDocsForUI() };
  });

  ipcMain.handle('docs:setActive', (_e, filePath: string) => {
    try {
      const found = getImportedDoc(filePath);
      if (!found) return { success: false, error: 'Document not found' };
      setActiveDocContext(found.context, found.filePath, deps.mainWindow(), deps.log);
      return { success: true };
    } catch (err: any) {
      deps.log.error('docs:setActive error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('docs:remove', (_e, filePath: string) => {
    try {
      const success = removeImportedDoc(filePath);
      if (!success) return { success: false, error: 'Document not found' };
      if (activeDocPath === filePath) {
        clearActiveDocContext(deps.mainWindow(), deps.log);
      }
      return { success: true };
    } catch (err: any) {
      deps.log.error('docs:remove error', err);
      return { success: false, error: err.message };
    }
  });
}
