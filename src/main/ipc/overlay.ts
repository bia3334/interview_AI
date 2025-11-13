import { BrowserWindow, IpcMain, screen } from 'electron';
import * as path from 'path';

// Overlay state
let overlayWindow: BrowserWindow | null = null;
let overlayPinned: boolean = false;
let overlayAutoHideTimer: NodeJS.Timeout | null = null;
let latestAIResponse: string = '';

/**
 * Create or get the overlay window
 */
function createOrGetOverlayWindow(preloadPath: string): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const overlayWidth = 600;
  const overlayMaxHeight = 400;
  const margin = 16;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayMaxHeight,
    x: width - overlayWidth - margin,
    y: height - overlayMaxHeight - margin,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setContentProtection(true);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 2);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  overlayWindow.loadFile(path.join(__dirname, '..', '..', 'overlay.html'));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

/**
 * Update overlay content
 */
function updateOverlay(text?: string) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay-update', text ?? latestAIResponse);
}

/**
 * Show overlay
 */
function showOverlay(text?: string, preloadPath?: string) {
  const win = createOrGetOverlayWindow(preloadPath || path.join(__dirname, '..', '..', 'preload', 'index.js'));
  if (!win.isVisible()) {
    win.showInactive();
  }
  updateOverlay(text);
}

/**
 * Hide overlay
 */
function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

/**
 * Show overlay with auto-hide
 */
function autoShowOverlay(text?: string, durationMs: number = 2000, preloadPath?: string) {
  showOverlay(text, preloadPath);
  if (overlayAutoHideTimer) {
    clearTimeout(overlayAutoHideTimer);
    overlayAutoHideTimer = null;
  }
  if (!overlayPinned) {
    overlayAutoHideTimer = setTimeout(() => {
      if (!overlayPinned) {
        hideOverlay();
      }
    }, durationMs);
  }
}

/**
 * Toggle overlay pin state
 */
function toggleOverlayPin(): boolean {
  overlayPinned = !overlayPinned;
  setOverlayInteractive(overlayPinned);
  return overlayPinned;
}

/**
 * Enable/disable overlay interactivity
 */
function setOverlayInteractive(enabled: boolean) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    overlayWindow.setIgnoreMouseEvents(!enabled, { forward: true });
  } catch {}
}

/**
 * Move overlay to corner
 */
function moveOverlayToCorner(corner: 'bottom-left' | 'bottom-right') {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const overlayWidth = 600;
  const overlayMaxHeight = 400;
  const margin = 16;
  
  let x: number;
  const y = height - overlayMaxHeight - margin;
  
  if (corner === 'bottom-left') {
    x = margin;
  } else {
    x = width - overlayWidth - margin;
  }
  
  overlayWindow.setBounds({ x, y, width: overlayWidth, height: overlayMaxHeight });
}

/**
 * Set the latest AI response
 */
function setLatestAIResponse(response: string) {
  latestAIResponse = response;
}

/**
 * Get current overlay state
 */
function getOverlayState() {
  return {
    isPinned: overlayPinned,
    isVisible: overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible(),
    latestResponse: latestAIResponse,
  };
}

/**
 * Register overlay IPC handlers
 */
export function registerOverlayIPC(ipcMain: IpcMain, deps: { preloadPath: string }) {
  // No IPC handlers needed currently - all interactions are via function calls
  // This can be extended if renderer needs to control overlay directly
}

/**
 * Export overlay functions for use in main process
 */
export const overlayManager = {
  show: showOverlay,
  hide: hideOverlay,
  autoShow: autoShowOverlay,
  update: updateOverlay,
  togglePin: toggleOverlayPin,
  setInteractive: setOverlayInteractive,
  moveToCorner: moveOverlayToCorner,
  setLatestResponse: setLatestAIResponse,
  getState: getOverlayState,
};
