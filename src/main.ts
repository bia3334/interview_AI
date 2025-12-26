import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, globalShortcut, clipboard, dialog, screen } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import screenshot from 'screenshot-desktop';
import * as fs from 'fs';
import * as os from 'os';
import * as electronLog from 'electron-log';
const Store = require('electron-store');

// Import modules
import { registerFilesIPC } from './main/ipc/files';
import { registerPreferencesIPC } from './main/ipc/preferences';
import { overlayManager, registerOverlayIPC } from './main/ipc/overlay';
import { registerDocumentsIPC, buildDocContextPrefix, setActiveDocContext } from './main/ipc/documents';
import { createWindow, getMainWindow, toggleMainWindow, hideMainWindow, showMainWindow, toggleMouseEvents, moveWindow, notifyRenderer } from './main/window';
import { getApiKey, sendPromptToGemini, sendPromptToOpenAI, sendConversationToOpenAI, sendConversationToGemini, getOpenAIClient, getGeminiClient, getCurrentOpenAIModel, AI_CONFIG } from './main/ai/clients';
import { generatePrompt } from './main/ai/prompts';
import { safeDeleteFile, imageToBase64 } from './main/utils/files';

import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
const { createPartFromUri } = require('@google/genai');

// Configure logging
electronLog.initialize();
electronLog.transports.file.level = 'info';
const log = electronLog;

// Load environment variables
dotenv.config();

// Store Configuration
const STORE_DEFAULTS = {
  windowPosition: { x: 100, y: 100 },
  windowSize: { width: 1600, height: 1200 },
  preferredLanguage: 'python',
  answerStyle: 'explanation',
  defaultModel: 'both',
  openaiModel: AI_CONFIG.openai.model
};

const store = new Store({ defaults: STORE_DEFAULTS });

// Global variables
let screenshotQueue: string[] = [];
const tempDir = path.join(os.tmpdir(), 'open-interview-coder');
let latestAIResponse: string = '';

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Screenshot Management
const addScreenshot = (screenshotPath: string) => {
  screenshotQueue.push(screenshotPath);
  if (screenshotQueue.length > 5) {
    const oldScreenshot = screenshotQueue.shift();
    if (oldScreenshot) {
      safeDeleteFile(oldScreenshot, 0, log);
    }
  }
};

const takeScreenshot = async (): Promise<string> => {
  const timestamp = new Date().getTime();
  const screenshotPath = path.join(tempDir, `screenshot-${timestamp}.png`);
  const imgBuffer = await screenshot();
  fs.writeFileSync(screenshotPath, imgBuffer);
  log.info(`Screenshot saved to ${screenshotPath}`);
  return screenshotPath;
};

const importClipboardImage = async (): Promise<{ success: boolean; path?: string; error?: string }> => {
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
    addScreenshot(filePath);

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

const clearScreenshots = async () => {
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

// AI Prompt Handlers
ipcMain.handle('sendPromptToGemini', async (_event: IpcMainInvokeEvent, prompt: string) => {
  try {
    log.info('Sending request to Google Gemini API');
    const docPrefix = buildDocContextPrefix();
    const finalPrompt = docPrefix ? `${docPrefix}\n\n${prompt}` : prompt;
    const result = await sendPromptToGemini([finalPrompt], store);

    const assistantReply = result.text || 'No response from Google Gemini.';
    latestAIResponse = assistantReply;
    overlayManager.setLatestResponse(assistantReply);
    overlayManager.autoShow(assistantReply, 2000, path.join(__dirname, 'preload', 'index.js'));

    log.info('Received response from Google Gemini API');
    return assistantReply;
  } catch (error) {
    log.error('Failed to fetch from Google Gemini:', error);
    throw new Error(`Failed to fetch from Google Gemini: ${(error as Error).message}`);
  }
});

ipcMain.handle('sendPromptToOpenAI', async (_event: IpcMainInvokeEvent, prompt: string) => {
  try {
    log.info('Sending request to OpenAI API');
    const docPrefix = buildDocContextPrefix();
    const finalPrompt = docPrefix ? `${docPrefix}\n\n${prompt}` : prompt;
    const assistantReply = await sendPromptToOpenAI(finalPrompt, store);
    
    latestAIResponse = assistantReply;
    overlayManager.setLatestResponse(assistantReply);
    overlayManager.autoShow(assistantReply, 2000, path.join(__dirname, 'preload', 'index.js'));

    log.info('Received response from OpenAI API');
    return assistantReply;
  } catch (error) {
    log.error('Failed to fetch from OpenAI:', error);
    throw new Error(`Failed to fetch from OpenAI: ${(error as Error).message}`);
  }
});

// Conversation-aware prompts (with history)
ipcMain.handle('sendConversationToOpenAI', async (_event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
  try {
    log.info('Sending conversation request to OpenAI API');
    const assistantReply = await sendConversationToOpenAI(messages, store);
    
    latestAIResponse = assistantReply;
    overlayManager.setLatestResponse(assistantReply);
    overlayManager.autoShow(assistantReply, 2000, path.join(__dirname, 'preload', 'index.js'));

    log.info('Received conversation response from OpenAI API');
    return assistantReply;
  } catch (error) {
    log.error('Failed to fetch conversation from OpenAI:', error);
    throw new Error(`Failed to fetch conversation from OpenAI: ${(error as Error).message}`);
  }
});

ipcMain.handle('sendConversationToGemini', async (_event: IpcMainInvokeEvent, messages: Array<{ role: 'user' | 'assistant'; content: string }>) => {
  try {
    log.info('Sending conversation request to Gemini API');
    const assistantReply = await sendConversationToGemini(messages, store);
    
    latestAIResponse = assistantReply;
    overlayManager.setLatestResponse(assistantReply);
    overlayManager.autoShow(assistantReply, 2000, path.join(__dirname, 'preload', 'index.js'));

    log.info('Received conversation response from Gemini API');
    return assistantReply;
  } catch (error) {
    log.error('Failed to fetch conversation from Gemini:', error);
    throw new Error(`Failed to fetch conversation from Gemini: ${(error as Error).message}`);
  }
});

// Screenshot Analysis
const analyzeScreenshotsWithGemini = async (options: { language?: string }) => {
  if (screenshotQueue.length === 0) {
    return { success: false, error: 'No screenshots available to analyze' };
  }

  try {
    const ai = getGeminiClient(store);
    const screenshots = [...screenshotQueue];
    const language = options.language || store.get('preferredLanguage') || 'python';
    const answerStyle = store.get('answerStyle', 'code');
    const docPrefix = buildDocContextPrefix();
    const promptText = generatePrompt(answerStyle, language, undefined, docPrefix);

    const parts = [promptText];
    for (const screenshotPath of screenshots) {
      try {
        const image = await ai.files.upload({ file: screenshotPath });
        parts.push(createPartFromUri(image.uri, image.mimeType));
      } catch (error) {
        log.error(`Error processing image ${screenshotPath}:`, error);
      }
    }

    const result = await sendPromptToGemini(parts, store);
    const analysis = result.text || 'Analysis completed, but no specific solution was generated.';
    
    latestAIResponse = analysis;
    overlayManager.setLatestResponse(analysis);
    overlayManager.autoShow(analysis, 2000, path.join(__dirname, 'preload', 'index.js'));

    return { success: true, analysis, screenshots };
  } catch (error) {
    log.error('Error analyzing screenshots with Gemini:', error);
    return { success: false, error: (error as Error).message };
  }
};

const analyzeScreenshotsWithOpenAI = async (options: { language?: string }) => {
  if (screenshotQueue.length === 0) {
    return { success: false, error: 'No screenshots available to analyze' };
  }

  try {
    const openai = getOpenAIClient(store);
    const screenshots = [...screenshotQueue];
    const language = options.language || store.get('preferredLanguage') || 'python';
    const answerStyle = store.get('answerStyle') || 'code';
    const docPrefix = buildDocContextPrefix();
    const promptText = generatePrompt(answerStyle, language, undefined, docPrefix);

    const content: ChatCompletionContentPart[] = [{ type: "text", text: promptText }];

    for (const screenshotPath of screenshots) {
      try {
        const base64Image = imageToBase64(screenshotPath);
        content.push({
          type: "image_url",
          image_url: { url: `data:image/png;base64,${base64Image}` }
        } as ChatCompletionContentPart);
      } catch (error) {
        log.error(`Error processing image ${screenshotPath}:`, error);
      }
    }

    const response = await openai.chat.completions.create({
      model: getCurrentOpenAIModel(store),
      messages: [{ role: 'user', content }],
    });

    const analysis = response.choices[0]?.message?.content || 'Analysis completed, but no specific solution was generated.';
    latestAIResponse = analysis;
    overlayManager.setLatestResponse(analysis);
    overlayManager.autoShow(analysis, 2000, path.join(__dirname, 'preload', 'index.js'));

    return { success: true, analysis, screenshots };
  } catch (error) {
    log.error('Error analyzing screenshots with OpenAI:', error);
    return { success: false, error: (error as Error).message };
  }
};

ipcMain.handle('analyze-screenshots', async (_event, options: { language?: string }) => 
  analyzeScreenshotsWithGemini(options));
ipcMain.handle('analyzeScreenshotsWithGemini', async (_event, options: { language?: string }) => 
  analyzeScreenshotsWithGemini(options));
ipcMain.handle('analyzeScreenshotsWithOpenAI', async (_event, options: { language?: string }) => 
  analyzeScreenshotsWithOpenAI(options));

// Screenshot IPC Handlers
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

ipcMain.handle('import-clipboard-image', async () => importClipboardImage());

ipcMain.handle('take-screenshot', async () => {
  try {
    const screenshotPath = await takeScreenshot();
    addScreenshot(screenshotPath);
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

// Text extraction from screenshots
const extractWithOpenAI = async (screenshots: string[], extractPrompt: string): Promise<string> => {
  const openai = getOpenAIClient(store);
  const content: ChatCompletionContentPart[] = [{ type: "text", text: extractPrompt }];

  for (const screenshotPath of screenshots) {
    try {
      const base64Image = imageToBase64(screenshotPath);
      content.push({
        type: "image_url",
        image_url: { url: `data:image/png;base64,${base64Image}` }
      } as ChatCompletionContentPart);
    } catch (error) {
      log.error(`Error processing image ${screenshotPath}:`, error);
    }
  }

  const response = await openai.chat.completions.create({
    model: getCurrentOpenAIModel(store),
    messages: [{ role: 'user', content }],
  });

  return response.choices[0]?.message?.content || 'No text extracted';
};

ipcMain.handle('extractTextFromScreenshots', async () => {
  if (screenshotQueue.length === 0) {
    return { success: false, error: 'No screenshots available to extract text from' };
  }

  try {
    const screenshots = [...screenshotQueue];
    const extractPrompt = `Please extract and list all the text you can see in these screenshots. Only return the extracted text, no analysis or explanation.\n\n[EXTRACTED TEXT]`;

    const geminiKey = getApiKey('gemini', store, log);
    const openaiKey = getApiKey('openai', store, log);
    
    let extractedText = '';

    if (geminiKey) {
      try {
        const ai = getGeminiClient(store);
        const parts = [extractPrompt];

        for (const screenshotPath of screenshots) {
          try {
            const image = await ai.files.upload({ file: screenshotPath });
            parts.push(createPartFromUri(image.uri, image.mimeType));
          } catch (error) {
            log.error(`Error processing image ${screenshotPath}:`, error);
          }
        }

        const result = await sendPromptToGemini(parts, store);
        extractedText = result.text || 'No text extracted';
      } catch (geminiError) {
        log.warn('Gemini extraction failed, falling back to OpenAI:', geminiError);
        if (openaiKey) {
          extractedText = await extractWithOpenAI(screenshots, extractPrompt);
        } else {
          throw new Error('Gemini extraction failed and no OpenAI API key available');
        }
      }
    } else if (openaiKey) {
      extractedText = await extractWithOpenAI(screenshots, extractPrompt);
    } else {
      throw new Error('No API key configured. Please set either Gemini or OpenAI API key in Settings.');
    }
    
    clipboard.writeText(extractedText);
    const mainWindow = getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('process-clipboard-prompt');
    }

    return { success: true, extractedText };
  } catch (error) {
    log.error('Error extracting text from screenshots:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Region screenshot handler
let isRegionScreenshotInProgress = false;
ipcMain.handle('take-region-screenshot', async () => {
  // Prevent multiple simultaneous region screenshots
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
    const fullScreenshotPath = await takeScreenshot();
    
    // Get the primary display's scale factor for DPI scaling
    const primaryDisplay = screen.getPrimaryDisplay();
    const scaleFactor = primaryDisplay.scaleFactor;
    
    const regionWindow = new BrowserWindow({
      fullscreen: true,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      closable: false,
      minimizable: false,
      maximizable: false,
      resizable: false,
      movable: false,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload', 'index.js')
      }
    });

    regionWindow.setAlwaysOnTop(true, 'screen-saver');
    regionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    const preventClose = (e: Electron.Event) => e.preventDefault();
    regionWindow.on('close', preventClose);
    regionWindow.on('minimize', preventClose);
    regionWindow.on('maximize', preventClose);
    
    regionWindow.show();

    const regionSelectionHTML = `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;cursor:crosshair;user-select:none;background:transparent;overflow:hidden;-webkit-app-region:no-drag}*{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.selection-box{position:absolute;border:none;background:transparent;display:none;z-index:1000}</style></head><body><div class="selection-box" id="selectionBox"></div><script>document.addEventListener('contextmenu',e=>e.preventDefault());document.addEventListener('keydown',e=>{if(e.key!=='Escape'){e.preventDefault();e.stopPropagation()}});window.addEventListener('blur',()=>window.focus());let isSelecting=false,captured=false,startX,startY;document.addEventListener('mousedown',e=>{if(captured)return;isSelecting=true;startX=e.clientX;startY=e.clientY});document.addEventListener('mousemove',e=>{if(!isSelecting)return});document.addEventListener('mouseup',e=>{if(!isSelecting||captured)return;isSelecting=false;captured=true;const left=Math.min(startX,e.clientX),top=Math.min(startY,e.clientY),width=Math.abs(e.clientX-startX),height=Math.abs(e.clientY-startY);if(width>10&&height>10)window.electronAPI.captureRegion({x:left,y:top,width,height});else captured=false});document.addEventListener('keydown',e=>{if(e.key==='Escape')window.electronAPI.cancelRegionScreenshot()})</script></body></html>`;
    
    await regionWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(regionSelectionHTML));
    
    return new Promise((resolve) => {
      ipcMain.once('capture-region', async (event, region) => {
        try {
          regionWindow.destroy();
          const sharp = require('sharp');
          const croppedPath = path.join(tempDir, `region-${Date.now()}.png`);
          
          // Read file into buffer first to avoid file locking issues on Windows
          const imageBuffer = fs.readFileSync(fullScreenshotPath);
          
          // Apply scale factor for high DPI displays
          // Mouse coordinates are in logical pixels, screenshot is in physical pixels
          const scaledRegion = {
            left: Math.round(region.x * scaleFactor),
            top: Math.round(region.y * scaleFactor),
            width: Math.round(region.width * scaleFactor),
            height: Math.round(region.height * scaleFactor)
          };
          
          log.info(`Region capture: logical=${JSON.stringify(region)}, scaleFactor=${scaleFactor}, physical=${JSON.stringify(scaledRegion)}`);
          
          // Process from buffer instead of file path
          await sharp(imageBuffer)
            .extract(scaledRegion)
            .toFile(croppedPath);
          
          addScreenshot(croppedPath);
          
          // Delete immediately since we read the file into memory
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

// Copy latest response
ipcMain.handle('copy-latest-response', () => {
  try {
    if (latestAIResponse) {
      clipboard.writeText(latestAIResponse);
      return { success: true };
    }
    return { success: false, error: 'No response available to copy' };
  } catch (error) {
    log.error('Error copying to clipboard:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Clipboard prompt processing
ipcMain.handle('processClipboardPrompt', async () => {
  try {
    const clipboardText = clipboard.readText().trim();
    if (!clipboardText) {
      return { success: false, error: 'No text found in clipboard' };
    }

    const defaultModel = store.get('defaultModel') || 'both';
    const answerStyle = store.get('answerStyle', 'explanation');
    const language = store.get('preferredLanguage') || 'python';
    const docPrefix = buildDocContextPrefix();
    const promptText = generatePrompt(answerStyle, language, clipboardText, docPrefix);

    const promises = [];
    let openaiResponse = '';
    let geminiResponse = '';
    
    if (defaultModel === 'both' || defaultModel === 'openai') {
      promises.push(
        sendPromptToOpenAI(promptText, store)
          .then(response => {
            openaiResponse = response;
            latestAIResponse = response;
            overlayManager.setLatestResponse(response);
            overlayManager.autoShow(response, 2000, path.join(__dirname, 'preload', 'index.js'));
            return response;
          })
          .catch((error: Error) => {
            openaiResponse = `OpenAI Error: ${error.message}`;
            return openaiResponse;
          })
      );
    }
    
    if (defaultModel === 'both' || defaultModel === 'gemini') {
      promises.push(
        sendPromptToGemini([promptText], store)
          .then((result: any) => {
            const response = result.text || 'No response from Gemini';
            geminiResponse = response;
            latestAIResponse = response;
            overlayManager.setLatestResponse(response);
            overlayManager.autoShow(response, 2000, path.join(__dirname, 'preload', 'index.js'));
            return response;
          })
          .catch((error: Error) => {
            geminiResponse = `Gemini Error: ${error.message}`;
            return geminiResponse;
          })
      );
    }

    await Promise.allSettled(promises);
    const finalResponse = latestAIResponse || openaiResponse || geminiResponse || 'No response received';

    if (finalResponse && finalResponse !== 'No response received') {
      clipboard.writeText(finalResponse);
    }

    return {
      success: true,
      prompt: clipboardText,
      openaiResponse,
      geminiResponse
    };
  } catch (error) {
    log.error('Error processing clipboard prompt via IPC:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Window management
ipcMain.on('close-window', () => getMainWindow()?.close());
ipcMain.on('hide-window', () => hideMainWindow(store));
ipcMain.on('show-window', () => showMainWindow(store));
ipcMain.on('move-window', (_event, direction) => moveWindow(direction));

// Register IPC modules
registerFilesIPC(ipcMain, { 
  dialog, 
  log, 
  askAboutFileWithOpenAI: async (filePath: string, question: string) => {
    // This needs to be implemented in files.ts or here
    // For now, keeping it simple
    return "File Q&A functionality needs implementation";
  }
});
registerPreferencesIPC(ipcMain, { store, log, getApiKey: (type) => getApiKey(type, store, log) });
registerOverlayIPC(ipcMain, { preloadPath: path.join(__dirname, 'preload', 'index.js') });
registerDocumentsIPC(ipcMain, { mainWindow: getMainWindow, log });

// Application initialization
app.whenReady().then(() => {
  createWindow(store, path.join(__dirname, 'preload', 'index.js'));
  log.info('Application started');

  // Shortcuts
  globalShortcut.register('CommandOrControl+Shift+W', () => toggleMouseEvents());
  globalShortcut.register('CommandOrControl+Shift+A', () => toggleMainWindow(store));
  
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    const state = overlayManager.getState();
    if (state.isVisible) {
      overlayManager.hide();
      if (state.isPinned) overlayManager.togglePin();
    } else {
      overlayManager.show(latestAIResponse, path.join(__dirname, 'preload', 'index.js'));
      if (!state.isPinned) overlayManager.togglePin();
    }
  });

  globalShortcut.register('CommandOrControl+Shift+L', () => {
    const styles = ['code', 'explanation', 'multiple-choice'];
    const current = store.get('answerStyle') || 'explanation';
    const newStyle = styles[(styles.indexOf(current) + 1) % styles.length];
    store.set('answerStyle', newStyle);
    notifyRenderer('answer-style-changed', newStyle);
  });

  globalShortcut.register('CommandOrControl+Shift+M', () => {
    const models = ['both', 'openai', 'gemini'];
    const currentModel = store.get('defaultModel') || 'both';
    const newModel = models[(models.indexOf(currentModel) + 1) % models.length];
    store.set('defaultModel', newModel);
    notifyRenderer('model-changed', newModel);
  });

  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    try {
      const screenshotPath = await takeScreenshot();
      addScreenshot(screenshotPath);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.webContents.send('screenshot-taken', { path: screenshotPath });
      }
    } catch (error) {
      log.error('Error taking full screenshot:', error);
    }
  });

  globalShortcut.register('CommandOrControl+Shift+Z', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('trigger-region-screenshot');
  });

  globalShortcut.register('CommandOrControl+Shift+X', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('extract-text-from-screenshots');
  });

  globalShortcut.register('CommandOrControl+Shift+D', async () => {
    await clearScreenshots();
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('screenshots-cleared');
  });

  globalShortcut.register('CommandOrControl+Shift+P', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('process-screenshots');
  });

  globalShortcut.register('CommandOrControl+Shift+Q', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('process-clipboard-prompt');
  });

  globalShortcut.register('CommandOrControl+Shift+C', () => {
    if (latestAIResponse) clipboard.writeText(latestAIResponse);
  });

  // Arrow key shortcuts
  ['Up', 'Down', 'Left', 'Right'].forEach(dir => {
    globalShortcut.register(`CommandOrControl+Shift+${dir}`, () => moveWindow(dir.toLowerCase() as any));
    globalShortcut.register(`CommandOrControl+${dir}`, () => {
      const mainWindow = getMainWindow();
      if (mainWindow) mainWindow.webContents.send('scroll-content', { direction: dir.toLowerCase() });
    });
  });

  globalShortcut.register('CommandOrControl+Left', () => {
    if (overlayManager.getState().isVisible) overlayManager.moveToCorner('bottom-left');
  });

  globalShortcut.register('CommandOrControl+Right', () => {
    if (overlayManager.getState().isVisible) overlayManager.moveToCorner('bottom-right');
  });

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('switch-tab', 'next');
  });

  globalShortcut.register('CommandOrControl+Shift+Tab', () => {
    const mainWindow = getMainWindow();
    if (mainWindow) mainWindow.webContents.send('switch-tab', 'previous');
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) {
    createWindow(store, path.join(__dirname, 'preload', 'index.js'));
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
