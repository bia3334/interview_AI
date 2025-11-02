// path: src/main/ipc/files.ts
import type { IpcMain, IpcMainInvokeEvent, Dialog } from 'electron';

export function registerFilesIPC(
  ipcMain: IpcMain,
  deps: {
    dialog: Dialog;
    log: { info: (...args: any[]) => void; error: (...args: any[]) => void };
    askAboutFileWithOpenAI: (filePath: string, question: string) => Promise<string>;
  }
) {
  const { dialog, log, askAboutFileWithOpenAI } = deps;

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

  // IPC: Upload the selected file and ask a question about it.
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
