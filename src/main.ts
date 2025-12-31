/**
 * Electron Main Process Entry Point
 * 
 * This file initializes the application and wires together all modules.
 * Individual functionality is delegated to dedicated modules.
 */
import * as dotenv from 'dotenv';
import { app, dialog, ipcMain } from 'electron';
import * as electronLog from 'electron-log';
import * as fs from 'fs';
import * as path from 'path';

// Import modules
import { getApiKey } from './main/ai/clients';
import { initDocumentsFromStore, registerDocumentsIPC } from './main/ipc/documents';
import { registerFilesIPC } from './main/ipc/files';
import { registerOverlayIPC } from './main/ipc/overlay';
import { registerPreferencesIPC } from './main/ipc/preferences';
import { registerScreenshotsIPC } from './main/ipc/screenshots';
import { registerAIIPC } from './main/ipc/ai';
import { registerGlobalShortcuts, unregisterAllShortcuts } from './main/shortcuts';
import { createStore } from './main/store';
import { createWindow, getMainWindow, hideMainWindow, moveWindow, showMainWindow } from './main/window';

// Configure logging
electronLog.initialize();
electronLog.transports.file.level = 'info';
const log = electronLog;

// Load environment variables
loadEnvFiles();

function loadEnvFiles() {
  try {
    const cwd = process.cwd();
    const files: string[] = ['.env'];
    const env = process.env.NODE_ENV || 'development';
    if (env === 'development') files.push('.env.local');
    if (env === 'production') files.push('.env.production');

    for (const fname of files) {
      const fpath = path.join(cwd, fname);
      if (fs.existsSync(fpath)) {
        dotenv.config({ path: fpath, override: true });
      }
    }
  } catch (e) {
    log.warn('dotenv loading warning:', e);
  }
}

// Initialize store
const store = createStore();

// Preload path for all modules
const preloadPath = path.join(__dirname, 'preload', 'index.js');

// Register all IPC modules
registerScreenshotsIPC({ log, preloadPath });
registerAIIPC({ store, log, preloadPath });
registerFilesIPC(ipcMain, { 
  dialog, 
  log, 
  askAboutFileWithOpenAI: async (filePath: string, question: string) => {
    return "File Q&A functionality needs implementation";
  },
  store,
  mainWindow: getMainWindow
});
registerPreferencesIPC(ipcMain, { store, log, getApiKey: (type) => getApiKey(type, store, log) });
registerOverlayIPC(ipcMain, { preloadPath });
registerDocumentsIPC(ipcMain, { mainWindow: getMainWindow, log });

// Window management IPC
ipcMain.on('close-window', () => getMainWindow()?.close());
ipcMain.on('hide-window', () => hideMainWindow(store));
ipcMain.on('show-window', () => showMainWindow(store));
ipcMain.on('move-window', (_event, direction) => moveWindow(direction));

// Application lifecycle
app.whenReady().then(() => {
  createWindow(store, preloadPath);
  initDocumentsFromStore(store, log);
  registerGlobalShortcuts({ store, log, preloadPath });
  log.info('Application started');
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (!getMainWindow()) {
    createWindow(store, preloadPath);
  }
});

app.on('will-quit', () => {
  unregisterAllShortcuts();
});
