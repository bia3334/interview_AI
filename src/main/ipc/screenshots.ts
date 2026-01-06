/**
 * Screenshot management and IPC handlers
 */
import { BrowserWindow, clipboard, ipcMain, screen } from 'electron';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import screenshot from 'screenshot-desktop';
import { safeDeleteFile } from '../utils/files';
import { getMainWindow } from '../window';
import { APP_NAME, MAX_SCREENSHOTS } from '../constants/app';

// Screenshot state
let screenshotQueue: string[] = [];
const tempDir = path.join(os.tmpdir(), APP_NAME);

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Getters for external access
export const getScreenshotQueue = () => [...screenshotQueue];
export const getTempDir = () => tempDir;

// Screenshot Management Functions
export const addScreenshot = (screenshotPath: string, log: any) => {
  screenshotQueue.push(screenshotPath);
  if (screenshotQueue.length > MAX_SCREENSHOTS) {
    const oldScreenshot = screenshotQueue.shift();
    if (oldScreenshot) {
      safeDeleteFile(oldScreenshot, 0, log);
    }
  }
};

export const takeScreenshot = async (log: any): Promise<string> => {
  const timestamp = new Date().getTime();
  const screenshotPath = path.join(tempDir, `screenshot-${timestamp}.png`);
  const imgBuffer = await screenshot();
  fs.writeFileSync(screenshotPath, imgBuffer);
  log.info(`Screenshot saved to ${screenshotPath}`);
  return screenshotPath;
};

export const importClipboardImage = async (log: any): Promise<{ success: boolean; path?: string; error?: string }> => {
  try {
    const img = clipboard.readImage();
    if (!img || img.isEmpty()) {
      const errorMsg = 'Clipboard does not contain an image';
      log.warn(errorMsg);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('toast', errorMsg);
      }
      return { success: false, error: errorMsg };
    }

    const pngBuffer = img.toPNG();
    const filePath = path.join(tempDir, `snipt-${Date.now()}.png`);
    await fs.promises.writeFile(filePath, pngBuffer);
    addScreenshot(filePath, log);

    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('screenshot-taken', { path: filePath, source: 'clipboard' });
    }

    log.info(`Imported clipboard image to ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    const msg = `Failed to import clipboard image: ${(error as Error).message}`;
    log.error(msg);
    return { success: false, error: msg };
  }
};

export const clearScreenshots = async (log: any) => {
  try {
    const files = await fs.promises.readdir(tempDir);
    await Promise.all(files.map(file => 
      safeDeleteFile(path.join(tempDir, file), 0, log)
    ));
    screenshotQueue = [];
    log.info('All screenshots deleted');
    return true;
  } catch (err) {
    log.error('Failed to delete screenshots:', err);
    return false;
  }
};

// Region screenshot state
let isRegionScreenshotInProgress = false;

export function registerScreenshotsIPC(
  deps: {
    log: any;
    preloadPath: string;
  }
) {
  const { log, preloadPath } = deps;

  // Basic screenshot handlers
  ipcMain.handle('get-screenshots', () => screenshotQueue);
  
  ipcMain.handle('remove-screenshot', (_event, index: number) => {
    try {
      if (index >= 0 && index < screenshotQueue.length) {
        const screenshotPath = screenshotQueue[index];
        screenshotQueue.splice(index, 1);
        safeDeleteFile(screenshotPath, 0, log);
        return { success: true };
      }
      return { success: false, error: 'Invalid screenshot index' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMain.handle('import-clipboard-image', async () => importClipboardImage(log));

  ipcMain.handle('take-screenshot', async () => {
    try {
      const screenshotPath = await takeScreenshot(log);
      addScreenshot(screenshotPath, log);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('screenshot-taken', { path: screenshotPath });
      }
      return { success: true, path: screenshotPath };
    } catch (error) {
      log.error('Error taking screenshot via API:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Region screenshot handler
  ipcMain.handle('take-region-screenshot', async () => {
    if (isRegionScreenshotInProgress) {
      log.warn('Region screenshot already in progress, ignoring duplicate request');
      return { success: false, error: 'Already in progress' };
    }
    isRegionScreenshotInProgress = true;
    
    try {
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide();
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
      const fullScreenshotPath = await takeScreenshot(log);
      
      const primaryDisplay = screen.getPrimaryDisplay();
      const scaleFactor = primaryDisplay.scaleFactor;
      
      const regionWindow = new BrowserWindow({
        fullscreen: true,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: true,
        closable: false,
        minimizable: false,
        maximizable: false,
        resizable: false,
        movable: false,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: preloadPath
        }
      });

      regionWindow.setAlwaysOnTop(true, 'screen-saver');
      regionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      
      const preventClose = (e: Electron.Event) => e.preventDefault();
      regionWindow.on('close', preventClose);
      regionWindow.on('minimize', preventClose);
      regionWindow.on('maximize', preventClose);
      
      regionWindow.show();

      // Load the region selection HTML file
      // __dirname = dist/main/ipc, so go up 2 levels to dist/, then into angular/
      const regionSelectionPath = path.join(__dirname, '..', '..', 'angular', 'region-selection.html');
      await regionWindow.loadFile(regionSelectionPath);
      
      return new Promise((resolve) => {
        ipcMain.once('capture-region', async (event, region) => {
          try {
            regionWindow.destroy();
            const sharp = require('sharp');
            const croppedPath = path.join(tempDir, `region-${Date.now()}.png`);
            
            const imageBuffer = fs.readFileSync(fullScreenshotPath);
            
            const scaledRegion = {
              left: Math.round(region.x * scaleFactor),
              top: Math.round(region.y * scaleFactor),
              width: Math.round(region.width * scaleFactor),
              height: Math.round(region.height * scaleFactor)
            };
            
            log.info(`Region capture: logical=${JSON.stringify(region)}, scaleFactor=${scaleFactor}, physical=${JSON.stringify(scaledRegion)}`);
            
            await sharp(imageBuffer)
              .extract(scaledRegion)
              .toFile(croppedPath);
            
            addScreenshot(croppedPath, log);
            
            try {
              fs.unlinkSync(fullScreenshotPath);
              log.info(`Deleted temporary full screenshot: ${fullScreenshotPath}`);
            } catch (deleteErr) {
              log.warn(`Could not delete temporary file immediately, will retry: ${fullScreenshotPath}`);
              setTimeout(() => safeDeleteFile(fullScreenshotPath, 0, log), 3000);
            }
            
            const mainWindow = getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.show();
              mainWindow.webContents.send('screenshot-taken', { path: croppedPath, source: 'region' });
            }
            
            isRegionScreenshotInProgress = false;
            resolve({ success: true, path: croppedPath });
          } catch (error) {
            regionWindow.destroy();
            isRegionScreenshotInProgress = false;
            resolve({ success: false, error: (error as Error).message });
          }
        });
        
        ipcMain.once('cancel-region-screenshot', () => {
          regionWindow.destroy();
          const mainWindow = getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
          }
          try {
            fs.unlinkSync(fullScreenshotPath);
            log.info(`Deleted cancelled screenshot: ${fullScreenshotPath}`);
          } catch (deleteErr) {
            setTimeout(() => safeDeleteFile(fullScreenshotPath, 0, log), 2000);
          }
          isRegionScreenshotInProgress = false;
          resolve({ success: false, cancelled: true });
        });
      });
    } catch (error) {
      log.error('Error taking region screenshot:', error);
      const mainWindow = getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
      }
      isRegionScreenshotInProgress = false;
      return { success: false, error: (error as Error).message };
    }
  });
}
