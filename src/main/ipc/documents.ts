import { BrowserWindow, IpcMain } from 'electron';
import * as path from 'path';

// Active Document Context
let activeDocContext: string | null = null;
let activeDocPath: string | null = null;
let activeDocKeyInfo: string | null = null;
const DOC_CONTEXT_MAX_CHARS = 1000000000000;

// Store reference for persistence
let store: any = null;

// Imported documents list
type ImportedDoc = { 
  filePath: string; 
  fileName: string; 
  length: number; 
  addedAt: number; 
  context: string;
  keyInfo?: string; // Extracted key information summary
};
let importedDocs: ImportedDoc[] = [];

/**
 * Initialize documents from store (call on app start)
 */
export const initDocumentsFromStore = (storeInstance: any, log: any) => {
  store = storeInstance;
  try {
    const savedDocs = store.get('importedDocuments') || [];
    importedDocs = savedDocs;
    log.info(`Loaded ${importedDocs.length} documents from store`);
  } catch (e) {
    log.warn('Failed to load documents from store', e);
    importedDocs = [];
  }
};

/**
 * Save documents to store
 */
const saveDocsToStore = () => {
  if (store) {
    store.set('importedDocuments', importedDocs);
  }
};

/**
 * Set active document context
 */
export const setActiveDocContext = (
  text: string, 
  filePath: string | undefined, 
  mainWindow: BrowserWindow | null,
  log: any,
  keyInfo?: string
) => {
  try {
    const truncated = text.length > DOC_CONTEXT_MAX_CHARS
      ? `${text.slice(0, DOC_CONTEXT_MAX_CHARS)}\n[Truncated document context]`
      : text;
    activeDocContext = truncated;
    activeDocPath = filePath || null;
    activeDocKeyInfo = keyInfo || null;
    
    // Upsert into importedDocs list
    if (filePath) {
      const fileName = path.basename(filePath);
      const idx = importedDocs.findIndex((d) => d.filePath === filePath);
      if (idx >= 0) {
        importedDocs[idx] = { ...importedDocs[idx], context: truncated, length: truncated.length, keyInfo };
      } else {
        importedDocs.push({ filePath, fileName, length: truncated.length, addedAt: Date.now(), context: truncated, keyInfo });
      }
      saveDocsToStore(); // Persist to store
    }
    
    log.info('Active document context set', filePath ? `for: ${filePath}` : '');
    if (mainWindow && !mainWindow.isDestroyed()) {
      const name = filePath ? path.basename(filePath) : 'document';
      mainWindow.webContents.send('toast', `Document loaded: ${name}${keyInfo ? ' (key info extracted)' : ''}`);
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
  activeDocKeyInfo = null;
  log.info('Cleared active document context');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toast', 'Document context cleared');
  }
};

/**
 * Build document context prefix for AI prompts
 * Uses extracted key info as the primary reference if available
 */
export const buildDocContextPrefix = () => {
  if (!activeDocContext && !activeDocKeyInfo) return '';
  const name = activeDocPath ? path.basename(activeDocPath) : 'document';
  
  // If we have extracted key info, use it as primary context
  if (activeDocKeyInfo) {
    return [
      `Use the following KEY INFORMATION extracted from the document "${name}" as your primary reference. Answer questions based on this information first. If the key info doesn't cover the question, you may refer to the full document context below.`,
      '',
      '--- KEY INFORMATION START ---',
      activeDocKeyInfo,
      '--- KEY INFORMATION END ---',
      '',
      activeDocContext ? [
        '--- FULL DOCUMENT CONTEXT (for reference) ---',
        activeDocContext.slice(0, 50000), // Limit full context to avoid token issues
        activeDocContext.length > 50000 ? '\n[Document truncated for context...]' : '',
        '--- END DOCUMENT ---'
      ].join('\n') : ''
    ].join('\n');
  }
  
  // Fallback to original behavior if no key info
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
    hasKeyInfo: !!d.keyInfo,
    keyInfoLength: d.keyInfo?.length || 0,
  }));
};

/**
 * Get document key info for viewing
 */
export const getDocKeyInfo = (filePath: string) => {
  const doc = importedDocs.find((d) => d.filePath === filePath);
  if (!doc) return { success: false, error: 'Document not found' };
  return {
    success: true,
    fileName: doc.fileName,
    keyInfo: doc.keyInfo || '',
    hasKeyInfo: !!doc.keyInfo,
    contentLength: doc.length,
    keyInfoLength: doc.keyInfo?.length || 0
  };
};

/**
 * Save/update document key info
 */
export const saveDocKeyInfo = (filePath: string, keyInfo: string, mainWindow: BrowserWindow | null, log: any) => {
  const idx = importedDocs.findIndex((d) => d.filePath === filePath);
  if (idx < 0) return { success: false, error: 'Document not found' };
  
  importedDocs[idx].keyInfo = keyInfo;
  saveDocsToStore();
  
  // Update active doc key info if this is the active document
  if (activeDocPath === filePath) {
    activeDocKeyInfo = keyInfo;
  }
  
  log.info(`Updated key info for: ${filePath}`);
  
  // Notify renderer to refresh
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('documents-updated');
  }
  
  return { 
    success: true, 
    keyInfoLength: keyInfo.length 
  };
};

/**
 * Get active document info
 */
export const getActiveDocInfo = () => {
  if (!activeDocContext) return { hasContext: false };
  return {
    hasContext: true,
    fileName: activeDocPath ? path.basename(activeDocPath) : undefined,
    length: activeDocContext.length,
    hasKeyInfo: !!activeDocKeyInfo
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
  saveDocsToStore(); // Persist to store
  
  if (wasActive) {
    activeDocContext = null;
    activeDocPath = null;
    activeDocKeyInfo = null;
  }
  
  return true;
};

/**
 * Rename imported document (display name only, not actual file)
 */
export const renameImportedDoc = (filePath: string, newName: string) => {
  const idx = importedDocs.findIndex((d) => d.filePath === filePath);
  if (idx < 0) return { success: false, error: 'Document not found' };
  
  importedDocs[idx].fileName = newName;
  saveDocsToStore();
  
  return { success: true, fileName: newName };
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
      setActiveDocContext(found.context, found.filePath, deps.mainWindow(), deps.log, found.keyInfo);
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

  ipcMain.handle('docs:getKeyInfo', (_e, filePath: string) => {
    try {
      return getDocKeyInfo(filePath);
    } catch (err: any) {
      deps.log.error('docs:getKeyInfo error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('docs:saveKeyInfo', (_e, filePath: string, keyInfo: string) => {
    try {
      return saveDocKeyInfo(filePath, keyInfo, deps.mainWindow(), deps.log);
    } catch (err: any) {
      deps.log.error('docs:saveKeyInfo error', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('docs:rename', (_e, filePath: string, newName: string) => {
    try {
      const result = renameImportedDoc(filePath, newName);
      if (result.success) {
        deps.log.info(`Renamed document to: ${newName}`);
        const win = deps.mainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send('documents-updated');
        }
      }
      return result;
    } catch (err: any) {
      deps.log.error('docs:rename error', err);
      return { success: false, error: err.message };
    }
  });
}
