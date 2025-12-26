import { BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as url from 'url';

let mainWindow: BrowserWindow | null = null;
let isIgnoringMouseEvents = true;
let isWindowVisible = true; // Changed to true so window shows by default

/**
 * Get main window instance
 */
export const getMainWindow = () => mainWindow;

/**
 * Get window visibility state
 */
export const getWindowState = () => ({
  isVisible: isWindowVisible,
  isIgnoringMouseEvents
});

/**
 * Hide main window
 */
export function hideMainWindow(store: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds();
    store.set('windowPosition', { x: bounds.x, y: bounds.y });
    store.set('windowSize', { width: bounds.width, height: bounds.height });

    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setOpacity(0);
    mainWindow.hide();
    isWindowVisible = false;
    isIgnoringMouseEvents = true;
  }
}

/**
 * Show main window
 */
export function showMainWindow(store: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const savedPosition = store.get('windowPosition');
    const savedSize = store.get('windowSize');

    if (savedPosition && savedSize) {
      mainWindow.setBounds({
        ...savedPosition,
        ...savedSize
      });
    }

    mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setContentProtection(true);
    mainWindow.setOpacity(1);
    mainWindow.show();
    isWindowVisible = true;
    
    // Notify renderer to refresh screenshots when window becomes visible
    mainWindow.webContents.send('window-shown');
  }
}

/**
 * Toggle main window visibility
 */
export function toggleMainWindow(store: any) {
  isWindowVisible ? hideMainWindow(store) : showMainWindow(store);
}

/**
 * Toggle mouse events
 */
export function toggleMouseEvents() {
  isIgnoringMouseEvents = !isIgnoringMouseEvents;
  if (mainWindow) {
    mainWindow.setIgnoreMouseEvents(isIgnoringMouseEvents, { forward: true });
  }
  return isIgnoringMouseEvents;
}

/**
 * Move window in direction
 */
export function moveWindow(direction: 'up' | 'down' | 'left' | 'right') {
  if (!mainWindow) return;

  const position = mainWindow.getPosition();
  const step = 200;

  let newX = position[0];
  let newY = position[1];

  switch (direction) {
    case 'up': newY -= step; break;
    case 'down': newY += step; break;
    case 'left': newX -= step; break;
    case 'right': newX += step; break;
  }

  mainWindow.setPosition(newX, newY);
}

/**
 * Notify renderer process
 */
export const notifyRenderer = (event: string, data?: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, data);
  }
};

/**
 * Create main window
 */
export function createWindow(store: any, preloadPath: string) {
  const savedPosition = store.get('windowPosition');
  const savedSize = store.get('windowSize');

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const x = Math.min(Math.max(savedPosition.x, 0), width - savedSize.width);
  const y = Math.min(Math.max(savedPosition.y, 0), height - savedSize.height);

  mainWindow = new BrowserWindow({
    width: savedSize.width,
    height: savedSize.height,
    x: x,
    y: y,
    show: isWindowVisible,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    titleBarStyle: 'customButtonsOnHover',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
    skipTaskbar: true,
  });

  mainWindow.setContentProtection(true);
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  if (process.platform === 'darwin') {
    mainWindow.setHiddenInMissionControl(true);
    mainWindow.setWindowButtonVisibility(false);
    mainWindow.setSkipTaskbar(true);
    mainWindow.setHasShadow(false);
  }

  mainWindow.webContents.setBackgroundThrottling(false);
  mainWindow.webContents.setFrameRate(60);

  // Suppress cache warnings (optional - these are harmless)
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) { // -3 is ERR_ABORTED, which we can ignore
      console.error('Failed to load:', errorCode, errorDescription, validatedURL);
    }
  });

  // Log when page loads
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('Window: Page loaded successfully');
    console.log('Window: URL:', mainWindow?.webContents.getURL());
  });

  // Log console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer ${level}]:`, message);
  });

  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, '..', 'angular', 'index.html'),
      protocol: 'file:',
      slashes: true
    })
  );

  mainWindow.setIgnoreMouseEvents(isIgnoringMouseEvents, { forward: true });

  mainWindow.on('moved', () => {
    if (mainWindow) {
      const position = mainWindow.getPosition();
      store.set('windowPosition', { x: position[0], y: position[1] });
    }
  });

  mainWindow.on('resized', () => {
    if (mainWindow) {
      const size = mainWindow.getSize();
      store.set('windowSize', { width: size[0], height: size[1] });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}
