// path: src/main/ipc/files.ts
import type { IpcMain, IpcMainInvokeEvent, Dialog, BrowserWindow } from 'electron';
import * as path from 'path';
import { readDocumentContent } from '../utils/files';
import { extractKeyInfoFromDocument } from '../ai/clients';
import { setActiveDocContext } from './documents';

export function registerFilesIPC(
  ipcMain: IpcMain,
  deps: {
    dialog: Dialog;
    log: { info: (...args: any[]) => void; error: (...args: any[]) => void; warn: (...args: any[]) => void };
    askAboutFileWithOpenAI: (filePath: string, question: string) => Promise<string>;
    store: any;
    mainWindow: () => BrowserWindow | null;
  }
) {
  const { dialog, log, askAboutFileWithOpenAI, store, mainWindow } = deps;

  // IPC: Open a native file picker for user to choose a document to upload.
  ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select a file to analyze',
      properties: ['openFile'],
      filters: [
        { name: 'Text & PDF & PPTX', extensions: ['txt', 'md', 'csv', 'json', 'log', 'pdf', 'pptx'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (canceled || !filePaths.length) {
      return { canceled: true };
    }
    return { canceled: false, filePath: filePaths[0] };
  });

  // IPC: Import document with key information extraction
  ipcMain.handle('import-document-with-keyinfo', async (_event: IpcMainInvokeEvent, payload: { filePath: string }) => {
    const { filePath } = payload;
    const fileName = path.basename(filePath);
    const win = mainWindow();
    
    try {
      log.info(`Importing document with key info extraction: ${fileName}`);
      
      // Notify UI that we're processing
      if (win && !win.isDestroyed()) {
        win.webContents.send('toast', `Reading ${fileName}...`);
      }
      
      // Step 1: Read document content
      const content = await readDocumentContent(filePath);
      if (!content || content.trim().length === 0) {
        return { success: false, error: 'Could not extract text from document' };
      }
      log.info(`Document content extracted: ${content.length} characters`);
      
      // Notify UI that we're extracting key info
      if (win && !win.isDestroyed()) {
        win.webContents.send('toast', `Extracting key information from ${fileName}...`);
      }
      
      // Step 2: Extract key information using AI
      let keyInfo = '';
      try {
        keyInfo = await extractKeyInfoFromDocument(content, fileName, store);
        log.info(`Key info extracted: ${keyInfo.length} characters`);
      } catch (extractError: any) {
        log.warn('Key info extraction failed, using raw content:', extractError.message);
        // Continue without key info - still useful to have the document
      }
      
      // Step 3: Set as active document context
      setActiveDocContext(content, filePath, win, log, keyInfo);
      
      // Step 4: Notify UI that documents have been updated
      if (win && !win.isDestroyed()) {
        win.webContents.send('documents-updated');
      }
      
      return { 
        success: true, 
        fileName,
        contentLength: content.length,
        keyInfoLength: keyInfo.length,
        hasKeyInfo: !!keyInfo
      };
    } catch (error: any) {
      log.error('import-document-with-keyinfo error:', error);
      return { success: false, error: error.message };
    }
  });

  // IPC: Upload the selected file and ask a question about it (legacy).
  ipcMain.handle(
    'ask-about-file-with-openai',
    async (_event: IpcMainInvokeEvent, payload: { filePath: string; question: string }) => {
      try {
        log.info('Uploading file and asking question via OpenAI Chat Completions');
        const result = await askAboutFileWithOpenAI(payload.filePath, payload.question);
        return { success: true, answer: result };
      } catch (error: any) {
        log.error('ask-about-file-with-openai error:', error);
        return { success: false, error: error.message };
      }
    }
  );
}
