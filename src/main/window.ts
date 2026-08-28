import { BrowserWindow, screen, shell } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { WINDOW_MOVE_STEP } from './constants/app';

let mainWindow: BrowserWindow | null = null;
// Start interactive: the launch mode picker must be clickable before any
// hotkey is known. Choosing Exam re-applies click-through via applyAppMode().
let isIgnoringMouseEvents = false;
let isWindowVisible = true; // Changed to true so window shows by default

export type AppMode = 'exam' | 'interview';
// Mode currently shown by the renderer; null while the launch picker is up.
let currentMode: AppMode | null = null;

/**
 * Pool of innocuous, system-looking window titles. One is picked at random on
 * every startup so the overlay can't be fingerprinted by a fixed window name
 * during window-enumeration scans run by proctoring / monitoring software.
 */
const DECOY_WINDOW_TITLES = [
  'Settings',
  'System Configuration',
  'Realtek Audio Console',
  'NVIDIA Control Panel',
  'Windows Security',
  'Microsoft Store',
  'Calculator',
  'Sticky Notes',
  'Task Host Window',
  'Microsoft Text Input Application',
];

/** Pick a random innocuous window title for this session. */
function generateRandomWindowTitle(): string {
  return DECOY_WINDOW_TITLES[Math.floor(Math.random() * DECOY_WINDOW_TITLES.length)];
}

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
 * If the user enabled the auto-interaction setting, make the window
 * immediately interactive (clicks land on the window, not on apps behind it)
 * whenever it becomes visible. Without this setting, hide+show resets to
 * click-through, forcing the user to re-press Ctrl/Cmd+Shift+W every time.
 */
function applyAutoInteractionIfEnabled(store: any) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  // Only exam mode is ever click-through (and then only unless the user opted
  // into auto-interaction). Interview mode is a panel you work in, and the
  // launch picker must stay clickable.
  if (currentMode !== 'exam' || store.get('autoInteractionOnShow')) {
    isIgnoringMouseEvents = false;
    mainWindow.setIgnoreMouseEvents(false, { forward: true });
  }
}

/**
 * Apply window behaviour for the chosen app mode.
 *   exam      — stealth: click-through unless auto-interaction is enabled
 *   interview — interactive panel (content protection stays on so the window
 *               is still invisible to screen sharing / recording)
 *   null      — mode picker is showing: interactive so it can be clicked
 */
export function applyAppMode(mode: AppMode | null, store: any) {
  currentMode = mode;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const stealth = mode === 'exam' && !store.get('autoInteractionOnShow');
  isIgnoringMouseEvents = stealth;
  mainWindow.setIgnoreMouseEvents(stealth, { forward: true });
  mainWindow.setContentProtection(true);
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

    applyAutoInteractionIfEnabled(store);

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

  let newX = position[0];
  let newY = position[1];

  switch (direction) {
    case 'up': newY -= WINDOW_MOVE_STEP; break;
    case 'down': newY += WINDOW_MOVE_STEP; break;
    case 'left': newX -= WINDOW_MOVE_STEP; break;
    case 'right': newX += WINDOW_MOVE_STEP; break;
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

  // Randomized, innocuous window title applied fresh on every startup so the
  // overlay can't be matched by a fixed name in window-enumeration scans.
  const windowTitle = generateRandomWindowTitle();

  mainWindow = new BrowserWindow({
    width: savedSize.width,
    height: savedSize.height,
    x: x,
    y: y,
    show: isWindowVisible,
    title: windowTitle,
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

  // Hold the randomized title: the Angular page's <title> would otherwise
  // overwrite the OS-level window title once it loads, defeating the decoy.
  mainWindow.setTitle(windowTitle);
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  // Open external links (target="_blank") in the user's default browser instead
  // of spawning an in-app window. Block everything that isn't an http(s) URL.
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith('https://') || targetUrl.startsWith('http://')) {
      shell.openExternal(targetUrl);
    }
    return { action: 'deny' };
  });

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

  // Honour the auto-interaction setting on the very first launch too, so the
  // window starts interactive instead of click-through if the user chose that.
  applyAutoInteractionIfEnabled(store);

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
