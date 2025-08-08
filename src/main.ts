import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, globalShortcut, screen, clipboard } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as dotenv from 'dotenv';
import screenshot from 'screenshot-desktop';
import * as fs from 'fs';
import * as os from 'os';
import * as electronLog from 'electron-log';
const Store = require('electron-store');

const { GoogleGenAI, createUserContent, createPartFromUri } = require('@google/genai');
import { OpenAI } from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';

// Configure logging
electronLog.initialize();
electronLog.transports.file.level = 'info';
const log = electronLog;

// Load environment variables
dotenv.config();

// AI Models Configuration
const AI_CONFIG = {
  gemini: {
    model: "gemini-2.5-pro"
  },
  openai: {
    models: {
      'o4-mini': 'o4-mini',
      'gpt-4.1': 'gpt-4.1'
    },
    default: 'o4-mini'
  }
};

// Store Configuration
const STORE_DEFAULTS = {
  windowPosition: { x: 100, y: 100 },
  windowSize: { width: 1600, height: 1200 },
  preferredLanguage: 'python',
  answerStyle: 'explanation',
  defaultModel: 'both',
  openaiModel: AI_CONFIG.openai.default
};

// Initialize store for settings
interface StoreSchema {
  windowPosition: { x: number, y: number };
  windowSize: { width: number, height: number };
  preferredLanguage: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  answerStyle?: 'code' | 'explanation' | 'multiple-choice';
  defaultModel?: 'openai' | 'gemini' | 'both';
  openaiModel?: string;
}

const store = new Store({ defaults: STORE_DEFAULTS });

// API Key Management
const getApiKey = (type: 'openai' | 'gemini') => {
  const keys = {
    openai: store.get('openaiApiKey') || store.get('apiKey') || process.env.OPENAI_API_KEY || '',
    gemini: store.get('geminiApiKey') || process.env.GEMINI_API_KEY || ''
  };
  
  const key = keys[type];
  if (key) {
    log.info(`${type.toUpperCase()} API key found`);
  } else {
    log.warn(`No ${type.toUpperCase()} API key found`);
  }
  return key;
};

// AI Client Management
const getOpenAIClient = () => {
  const apiKey = getApiKey('openai');
  if (!apiKey) {
    throw new Error('OpenAI API key is not configured');
  }
  return new OpenAI({ apiKey });
};

const getGeminiClient = () => {
  const apiKey = getApiKey('gemini');
  if (!apiKey) {
    throw new Error('Gemini API key is not configured');
  }
  return new GoogleGenAI({ apiKey });
};

// Model Management
const getCurrentOpenAIModel = () => store.get('openaiModel') || AI_CONFIG.openai.default;

// Prompt Generation
const generatePrompt = (answerStyle: string, language: string, question?: string) => {
  const basePrompt = question ? `Question: ${question}` : 'Please analyze these screenshots';
  
  const prompts = {
    code: `I'm taking a coding interview and need help with the following problem. ${basePrompt} and provide a solution in ${language}. First give 3-4 lines of explanation such as whats data structure or algorithm you want to use or how you gonna solve this, then provide the code.`,
    
    'multiple-choice': `I'm taking a multiple choice exam and need the correct answer(s). ${basePrompt} and provide only the answer(s) without any explanation.

Formatting Rules:
- Provide only the correct answer(s) (e.g., "Answer: a" or "Answer: a, c")
- Do not include any explanations, reasoning, or additional text
- Do not include section headers like "Answer:", "Final Answer:", etc.
- Keep it simple and direct

If multiple answers are correct, list them separated by commas.
If only one answer is correct, provide just that letter.`,
    
    explanation: `I'm taking an exam and need help with the following problem. ${basePrompt} and provide direct, concise answers.

Formatting Rules:
- Do not include any section headers like "Step-by-step", "Final Answer", "Explanation", etc.
- Write the answer exactly like a student would during an exam, with a clear and compact style.
- Avoid teaching tone or instructional language.

If this is a multiple choice question:
- State the correct answer(s) clearly (e.g., "Answer: a, c")
- Give brief reasoning for each correct choice
- Keep explanations short and to the point

If this is an algorithm design or theoretical question:
- Provide the solution directly without excessive explanation
- State the approach, key steps, and complexity analysis concisely
- Write as if you're a student answering an exam question, not teaching

If this is a proof question:
- Give a direct, step-by-step proof
- Use clear logic but keep it concise

Format your response to be exam-appropriate: clear, direct, and efficient.`
  };
  
  return prompts[answerStyle as keyof typeof prompts] || prompts.explanation;
};

// AI Request Functions
const sendPromptToGemini = (prompt: string[]) => {
  const ai = getGeminiClient();
  return ai.models.generateContent({
    model: AI_CONFIG.gemini.model,
    contents: [createUserContent(prompt)],
  });
};

const sendPromptToOpenAI = async (prompt: string) => {
  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: getCurrentOpenAIModel(),
    messages: [{ role: 'user', content: prompt }],
  });
  return response.choices[0]?.message?.content || '';
};

// Global variables
let mainWindow: BrowserWindow | null = null;
let screenshotQueue: string[] = [];
const tempDir = path.join(os.tmpdir(), 'open-interview-coder');

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Keep track of the current ignore state
let isIgnoringMouseEvents = true;
let isWindowVisible = false;

// Add a variable to store the latest AI response
let latestAIResponse: string = '';

// Helper function to notify renderer
const notifyRenderer = (event: string, data?: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, data);
  }
};

// Helper function to register shortcuts
const registerShortcut = (key: string, action: () => void) => {
  globalShortcut.register(key, action);
};

function hideMainWindow() {
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

function showMainWindow() {
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
    mainWindow.setOpacity(0);
    mainWindow.showInactive();
    mainWindow.setOpacity(1);
    isWindowVisible = true;
  }
}

function toggleMainWindow() {
  isWindowVisible ? hideMainWindow() : showMainWindow();
}

function createWindow() {
  // Get saved position and size or use defaults
  const savedPosition = store.get('windowPosition');
  const savedSize = store.get('windowSize');


  // Get screen dimensions
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

    // Enable transparent window
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    titleBarStyle: 'customButtonsOnHover',

    // WebPreferences
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    skipTaskbar: true,
  });

  // Register a new global shortcut for toggling
  globalShortcut.register('CommandOrControl+Shift+W', () => {
    // Flip the ignore state
    isIgnoringMouseEvents = !isIgnoringMouseEvents;

    // Apply the updated ignore state to the main window
    if (mainWindow) {
      mainWindow.setIgnoreMouseEvents(isIgnoringMouseEvents, { forward: true });
    }

    console.log('Toggled mouse events ignoring:', isIgnoringMouseEvents);
  });

  // Enhanced screen capture resistance
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

  // Load index.html
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true
    })
  );

  mainWindow.setIgnoreMouseEvents(isIgnoringMouseEvents, { forward: true });

  // Save window position when moved
  mainWindow.on('moved', () => {
    if (mainWindow) {
      const position = mainWindow.getPosition();
      store.set('windowPosition', { x: position[0], y: position[1] });
    }
  });

  // Save window size when resized
  mainWindow.on('resized', () => {
    if (mainWindow) {
      const size = mainWindow.getSize();
      store.set('windowSize', { width: size[0], height: size[1] });
    }
  });

  // Cleanup when closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Take a screenshot and save it to temp directory
async function takeScreenshot(): Promise<string> {
  try {
    const timestamp = new Date().getTime();
    const screenshotPath = path.join(tempDir, `screenshot-${timestamp}.png`);

    // Take screenshot
    const imgBuffer = await screenshot();
    fs.writeFileSync(screenshotPath, imgBuffer);

    log.info(`Screenshot saved to ${screenshotPath}`);
    return screenshotPath;
  } catch (error) {
    log.error('Failed to take screenshot:', error);
    console.error('Failed to take screenshot:', error);
    throw new Error(`Failed to take screenshot: ${(error as Error).message}`);
  }
}

// Convert image to base64
function imageToBase64(imagePath: string): string {
  try {
    const imageBuffer = fs.readFileSync(imagePath);
    return imageBuffer.toString('base64');
  } catch (error) {
    log.error('Failed to convert image to base64:', error);
    console.error('Failed to convert image to base64:', error);
    throw new Error(`Failed to convert image to base64: ${(error as Error).message}`);
  }
}

// Screenshot Management
const addScreenshot = (path: string) => {
  screenshotQueue.push(path);
  if (screenshotQueue.length > 5) {
    const oldScreenshot = screenshotQueue.shift();
    if (oldScreenshot && fs.existsSync(oldScreenshot)) {
      fs.unlinkSync(oldScreenshot);
    }
  }
};

const clearScreenshots = async () => {
  const screenshotsDir = path.join(os.tmpdir(), 'open-interview-coder');
  try {
    const files = await fs.promises.readdir(screenshotsDir);
    await Promise.all(files.map(file => 
      fs.promises.unlink(path.join(screenshotsDir, file))
    ));
    screenshotQueue = [];
    log.info('All screenshots deleted');
    return true;
  } catch (err) {
    log.error('Failed to delete screenshots:', err);
    return false;
  }
};

// Handle calls from the renderer to Google Gemini
ipcMain.handle('sendPromptToGemini', async (_event: IpcMainInvokeEvent, prompt: string) => {
  try {
    log.info('Sending request to Google Gemini API');

    // Make a request to Google Gemini
    const result = await sendPromptToGemini([prompt])

    const assistantReply = result.text || 'No response from Google Gemini.';
    
    // Store the latest response
    latestAIResponse = assistantReply;

    log.info('Received response from Google Gemini API');
    return assistantReply;
  } catch (error) {
    log.error('Failed to fetch from Google Gemini:', error);
    console.error('Failed to fetch from Google Gemini:', error);
    throw new Error(`Failed to fetch from Google Gemini: ${(error as Error).message}`);
  }
});

// Add handler for OpenAI
ipcMain.handle('sendPromptToOpenAI', async (_event: IpcMainInvokeEvent, prompt: string) => {
  try {
    log.info('Sending request to OpenAI API');

    // Make a request to OpenAI
    const assistantReply = await sendPromptToOpenAI(prompt);
    
    // Store the latest response
    latestAIResponse = assistantReply;

    log.info('Received response from OpenAI API');
    return assistantReply;
  } catch (error) {
    log.error('Failed to fetch from OpenAI:', error);
    console.error('Failed to fetch from OpenAI:', error);
    throw new Error(`Failed to fetch from OpenAI: ${(error as Error).message}`);
  }
});

// Keep compatibility with old analyze-screenshots endpoint
ipcMain.handle('analyze-screenshots', async (_event: IpcMainInvokeEvent, options: { language?: string }) => {
  // Just redirect to the Gemini implementation for backward compatibility
  return await analyzeScreenshotsWithGemini(options);
});

// Extract the handler function for reuse
async function analyzeScreenshotsWithGemini(options: { language?: string }) {
  if (screenshotQueue.length === 0) {
    const errorMsg = 'No screenshots available to analyze';
    log.error(errorMsg);
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    log.info('Analyzing screenshots with Google Gemini API');

    const ai = getGeminiClient();

    // Prepare screenshots for analysis
    const screenshots = [...screenshotQueue];
    const language = options.language || store.get('preferredLanguage') || 'python';
    const answerStyle = store.get('answerStyle', 'code');

    // Generate prompt using centralized function
    const promptText = generatePrompt(answerStyle, language);

    // Prepare parts array for Gemini
    const parts = [promptText];

    // Add images to the parts
    for (const screenshotPath of screenshots) {
      try {
        const image = await ai.files.upload({
          file: screenshotPath,
        });
        parts.push(createPartFromUri(image.uri, image.mimeType));
      } catch (error) {
        log.error(`Error processing image ${screenshotPath}:`, error);
        console.error(`Error processing image ${screenshotPath}:`, error);
      }
    }

    log.info('Sending request to Google Gemini API with images');
    console.log('Sending request to Google Gemini API with images');

    // Make a request to Gemini with images
    const result = await sendPromptToGemini(parts);

    const analysis = result.text || 'Analysis completed, but no specific solution was generated.';
    
    // Store the latest response
    latestAIResponse = analysis;

    log.info('Received analysis from Google Gemini API');
    console.log('Received analysis from Google Gemini API');

    return {
      success: true,
      analysis: analysis,
      screenshots: screenshots
    };
  } catch (error) {
    log.error('Error analyzing screenshots with Gemini:', error);
    console.error('Error analyzing screenshots with Gemini:', error);
    return { success: false, error: (error as Error).message };
  }
}

// Set up the Gemini handler to use the extracted function
ipcMain.handle('analyzeScreenshotsWithGemini', async (_event: IpcMainInvokeEvent, options: { language?: string }) => {
  return await analyzeScreenshotsWithGemini(options);
});

// Add a new handler for analyzing screenshots with OpenAI
ipcMain.handle('analyzeScreenshotsWithOpenAI', async (_event: IpcMainInvokeEvent, options: { language?: string }) => {
  if (screenshotQueue.length === 0) {
    const errorMsg = 'No screenshots available to analyze';
    log.error(errorMsg);
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    log.info('Analyzing screenshots with OpenAI API');

    const openai = getOpenAIClient();
    
    // Prepare screenshots for analysis
    const screenshots = [...screenshotQueue];
    const language = options.language || store.get('preferredLanguage') || 'python';

    // Build prompt for OpenAI
    const answerStyle = store.get('answerStyle', 'code');
    let promptText = ``;
    if (answerStyle === 'code') {
      promptText += `I'm taking a coding interview and need help with the following problem. Please analyze these screenshots and provide a solution in ${language}. First give 3-4 lines of explanation such as whats data structure or algorithm you want to use or how you gonna solve this, then provide the code.`;
    } else if (answerStyle === 'multiple-choice') {
      promptText += `
      I'm taking a multiple choice exam and need the correct answer(s). Please analyze these screenshots and provide only the answer(s) without any explanation.

      Formatting Rules:
      - Provide only the correct answer(s) (e.g., "Answer: a" or "Answer: a, c")
      - Do not include any explanations, reasoning, or additional text
      - Do not include section headers like "Answer:", "Final Answer:", etc.
      - Keep it simple and direct

      If multiple answers are correct, list them separated by commas.
      If only one answer is correct, provide just that letter.`;
    } else {
      promptText += `
      I'm taking an exam and need help with the following problem. Please analyze these screenshots and provide direct, concise answers.

      Formatting Rules:
      - Do not include any section headers like "Step-by-step", "Final Answer", "Explanation", etc.
      - Write the answer exactly like a student would during an exam, with a clear and compact style.
      - Avoid teaching tone or instructional language.

      If this is a multiple choice question:
      - State the correct answer(s) clearly (e.g., "Answer: a, c")
      - Give brief reasoning for each correct choice
      - Keep explanations short and to the point

      If this is an algorithm design or theoretical question:
      - Provide the solution directly without excessive explanation
      - State the approach, key steps, and complexity analysis concisely
      - Write as if you're a student answering an exam question, not teaching

      If this is a proof question:
      - Give a direct, step-by-step proof
      - Use clear logic but keep it concise

      Format your response to be exam-appropriate: clear, direct, and efficient.`;
    }

    // Convert images to base64 and create message content
    const content: ChatCompletionContentPart[] = [
      { type: "text", text: promptText }
    ];

    for (const screenshotPath of screenshots) {
      try {
        const base64Image = imageToBase64(screenshotPath);
        const dataUrl = `data:image/png;base64,${base64Image}`;
        
        content.push({
          type: "image_url",
          image_url: { url: dataUrl }
        } as ChatCompletionContentPart);
      } catch (error) {
        log.error(`Error processing image ${screenshotPath}:`, error);
        console.error(`Error processing image ${screenshotPath}:`, error);
      }
    }

    log.info('Sending request to OpenAI API with images');
    console.log('Sending request to OpenAI API with images');

    // Make a request to OpenAI with images
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'user',
          content: content
        }
      ],
    });

    const analysis = response.choices[0]?.message?.content || 'Analysis completed, but no specific solution was generated.';
    
    // Store the latest response
    latestAIResponse = analysis;

    log.info('Received analysis from OpenAI API');
    console.log('Received analysis from OpenAI API');

    return {
      success: true,
      analysis: analysis,
      screenshots: screenshots
    };
  } catch (error) {
    log.error('Error analyzing screenshots with OpenAI:', error);
    console.error('Error analyzing screenshots with OpenAI:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Update API Key and Preferences handlers
ipcMain.handle('save-api-key', (_event: IpcMainInvokeEvent, apiKey: string) => {
  try {
    // Save under both old and new names for compatibility
    store.set('apiKey', apiKey);
    store.set('openaiApiKey', apiKey);
    return { success: true };
  } catch (error) {
    log.error('Error saving API key:', error);
    console.error('Error saving API key:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Add handler for saving OpenAI API key
ipcMain.handle('saveGeminiApiKey', (_event: IpcMainInvokeEvent, apiKey: string) => {
  try {
    store.set('geminiApiKey', apiKey);
    log.info('Gemini API key saved successfully');
    return { success: true };
  } catch (error) {
    log.error('Error saving Gemini API key:', error);
    console.error('Error saving Gemini API key:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('saveOpenAIApiKey', (_event: IpcMainInvokeEvent, apiKey: string) => {
  try {
    store.set('openaiApiKey', apiKey);
    // Also save under old key name for compatibility
    store.set('apiKey', apiKey);
    log.info('OpenAI API key saved successfully');
    return { success: true };
  } catch (error) {
    log.error('Error saving OpenAI API key:', error);
    console.error('Error saving OpenAI API key:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('getGeminiApiKey', () => {
  return getApiKey('gemini');
});

ipcMain.handle('getOpenAIApiKey', () => {
  return getApiKey('openai');
});

// For backward compatibility
ipcMain.handle('get-api-key', () => {
  // Prioritize OpenAI API key for backward compatibility
  return getApiKey('openai') || getApiKey('gemini');
});

ipcMain.handle('save-preferences', (_event: IpcMainInvokeEvent, preferences: { preferredLanguage: string, answerStyle?: string }) => {
  try {
    if (preferences.preferredLanguage) {
      store.set('preferredLanguage', preferences.preferredLanguage);
    }
    if (preferences.answerStyle) {
      store.set('answerStyle', preferences.answerStyle);
    }
    return { success: true };
  } catch (error) {
    log.error('Error saving preferences:', error);
    console.error('Error saving preferences:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('get-preferences', () => {
  return {
    preferredLanguage: store.get('preferredLanguage') || 'python',
    answerStyle: store.get('answerStyle') || 'explanation'
  };
});

ipcMain.handle('get-screenshots', () => {
  return screenshotQueue;
});

ipcMain.handle('remove-screenshot', (_event: IpcMainInvokeEvent, index: number) => {
  try {
    if (index >= 0 && index < screenshotQueue.length) {
      const screenshotPath = screenshotQueue[index];
      screenshotQueue.splice(index, 1);

      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
      }

      return { success: true };
    }
    return { success: false, error: 'Invalid screenshot index' };
  } catch (error) {
    log.error('Error removing screenshot:', error);
    console.error('Error removing screenshot:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Window management handlers
ipcMain.on('close-window', () => {
  mainWindow?.close();
});

ipcMain.on('hide-window', () => {
  hideMainWindow();
});

ipcMain.on('show-window', () => {
  showMainWindow();
});

ipcMain.on('move-window', (_event, direction) => {
  if (!mainWindow) return;

  const position = mainWindow.getPosition();
  const step = 200; // pixels to move

  let newX = position[0];
  let newY = position[1];

  switch (direction) {
    case 'up':
      newY -= step;
      break;
    case 'down':
      newY += step;
      break;
    case 'left':
      newX -= step;
      break;
    case 'right':
      newX += step;
      break;
  }

  mainWindow.setPosition(newX, newY);
});

// Add screenshot handler
ipcMain.handle('take-screenshot', async () => {
  try {
    const screenshotPath = await takeScreenshot();
    addScreenshot(screenshotPath);

    // Notify renderer
    if (mainWindow) {
      mainWindow.webContents.send('screenshot-taken', { path: screenshotPath });
    }
    return { success: true, path: screenshotPath };
  } catch (error) {
    log.error('Error taking screenshot via API:', error);
    console.error('Error taking screenshot via API:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Add handler for saving default model preference
ipcMain.handle('saveDefaultModel', (_event: IpcMainInvokeEvent, defaultModel: 'openai' | 'gemini' | 'both') => {
  try {
    store.set('defaultModel', defaultModel);
    return { success: true };
  } catch (error) {
    log.error('Error saving default model preference:', error);
    console.error('Error saving default model preference:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('getDefaultModel', () => {
  return store.get('defaultModel') || 'both';
});

// Add handlers for OpenAI model
ipcMain.handle('getOpenAIModel', () => {
  return getCurrentOpenAIModel();
});

ipcMain.handle('saveOpenAIModel', (_event: IpcMainInvokeEvent, model: string) => {
  try {
    store.set('openaiModel', model);
    return { success: true };
  } catch (error) {
    log.error('Error saving OpenAI model preference:', error);
    console.error('Error saving OpenAI model preference:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Add a new IPC handler for copying the latest response to clipboard
ipcMain.handle('copy-latest-response', () => {
  try {
    if (latestAIResponse) {
      clipboard.writeText(latestAIResponse);
      return { success: true };
    }
    return { success: false, error: 'No response available to copy' };
  } catch (error) {
    log.error('Error copying to clipboard:', error);
    console.error('Error copying to clipboard:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Add handler for processing clipboard text (separate from global shortcut)
ipcMain.handle('processClipboardPrompt', async (_event: IpcMainInvokeEvent) => {
  try {
    const clipboardText = clipboard.readText().trim();
    console.log('Clipboard text:', clipboardText);
    
    if (!clipboardText) {
      return { success: false, error: 'No text found in clipboard' };
    }

    log.info('Processing clipboard text as prompt via IPC');
    console.log('Processing clipboard text as prompt via IPC');
    
    const defaultModel = store.get('defaultModel') || 'both';
    const answerStyle = store.get('answerStyle', 'explanation');
    const language = store.get('preferredLanguage') || 'python';
    
    console.log('Settings:', { defaultModel, answerStyle, language });
    
    // Build the same prompt as screenshot analysis
    let promptText = ``;
    if (answerStyle === 'code') {
      promptText = `I'm taking a coding interview and need help with the following problem. Please analyze this question and provide a solution in ${language}. 
      First give 3-4 lines of explanation such as whats data structure or algorithm you want to use or how you gonna solve this, then provide the code.
      
      Question: ${clipboardText}`;
    } else if (answerStyle === 'multiple-choice') {
      promptText = `
      I'm taking a multiple choice exam and need the correct answer(s). Please analyze this question and provide only the answer(s) without any explanation.

      Formatting Rules:
      - Provide only the correct answer(s) (e.g., "Answer: a" or "Answer: a, c")
      - Do not include any explanations, reasoning, or additional text
      - Do not include section headers like "Answer:", "Final Answer:", etc.
      - Keep it simple and direct

      If multiple answers are correct, list them separated by commas.
      If only one answer is correct, provide just that letter.

      Question: ${clipboardText}`;
    } else {
      promptText = `
      I'm taking an exam and need help with the following problem. Please analyze this question and provide direct, concise answers.

      Formatting Rules:
      - Do not include any section headers like "Step-by-step", "Final Answer", "Explanation", etc.
      - Write the answer exactly like a student would during an exam, with a clear and compact style.
      - Avoid teaching tone or instructional language.

      If this is a multiple choice question:
      - State the correct answer(s) clearly (e.g., "Answer: a, c")
      - Give brief reasoning for each correct choice
      - Keep explanations short and to the point

      If this is an algorithm design or theoretical question:
      - Provide the solution directly without excessive explanation
      - State the approach, key steps, and complexity analysis concisely
      - Write as if you're a student answering an exam question, not teaching

      If this is a proof question:
      - Give a direct, step-by-step proof
      - Use clear logic but keep it concise

      Format your response to be exam-appropriate: clear, direct, and efficient.

      Question: ${clipboardText}`;
    }
    
    // Send to selected models
    const promises = [];
    let openaiResponse = '';
    let geminiResponse = '';
    
    if (defaultModel === 'both' || defaultModel === 'openai') {
      promises.push(
        sendPromptToOpenAI(promptText)
          .then(response => {
            openaiResponse = response;
            latestAIResponse = response;
            log.info('OpenAI response received from clipboard prompt');
            console.log('OpenAI response:', response.substring(0, 100) + '...');
            return response;
          })
          .catch((error: Error) => {
            openaiResponse = `OpenAI Error: ${error.message}`;
            log.error('OpenAI error from clipboard prompt:', error);
            console.log('OpenAI error:', error.message);
            return openaiResponse;
          })
      );
    }
    
    if (defaultModel === 'both' || defaultModel === 'gemini') {
      promises.push(
        sendPromptToGemini([promptText])
          .then((result: any) => {
            const response = result.text || 'No response from Gemini';
            geminiResponse = response;
            latestAIResponse = response;
            log.info('Gemini response received from clipboard prompt');
            console.log('Gemini response:', response.substring(0, 100) + '...');
            return response;
          })
          .catch((error: Error) => {
            geminiResponse = `Gemini Error: ${error.message}`;
            log.error('Gemini error from clipboard prompt:', error);
            console.log('Gemini error:', error.message);
            return geminiResponse;
          })
      );
    }

    // Wait for all requests to complete
    await Promise.allSettled(promises);
    
    console.log('Final responses:', { openaiResponse: openaiResponse.substring(0, 50), geminiResponse: geminiResponse.substring(0, 50) });

    // Get the best response for automatic clipboard copy
    let finalResponse = latestAIResponse || openaiResponse || geminiResponse || 'No response received';

    // Automatically copy the latest response back to clipboard
    if (finalResponse && finalResponse !== 'No response received') {
      clipboard.writeText(finalResponse);
      log.info('AI response automatically copied to clipboard');
    }

    return {
      success: true,
      prompt: clipboardText,
      openaiResponse: openaiResponse,
      geminiResponse: geminiResponse
    };

  } catch (error) {
    log.error('Error processing clipboard prompt via IPC:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Application initialization
app.whenReady().then(() => {
  createWindow();
  log.info('Application started');
  console.log('Application started');
  console.log('CMD/Control+Shift+A for showing up');

  globalShortcut.register('CommandOrControl+Shift+A', () => {
    toggleMainWindow();
  });

  // Change answer type: Ctrl+Shift+L
  registerShortcut('CommandOrControl+Shift+L', () => {
    const styles = ['code', 'explanation', 'multiple-choice'];
    const current = store.get('answerStyle') || 'explanation';
    const currentIndex = styles.indexOf(current);
    const newStyle = styles[(currentIndex + 1) % styles.length];
    
    store.set('answerStyle', newStyle);
    log.info(`Switched answer style to: ${newStyle}`);
    notifyRenderer('answer-style-changed', newStyle);
  });

  // Switch AI model: Ctrl+Shift+M
  registerShortcut('CommandOrControl+Shift+M', () => {
    const models = ['both', 'openai', 'gemini'];
    const currentModel = store.get('defaultModel') || 'both';
    const currentIndex = models.indexOf(currentModel);
    const newModel = models[(currentIndex + 1) % models.length];
    
    store.set('defaultModel', newModel);
    log.info(`Switched AI model to: ${newModel}`);
    notifyRenderer('model-changed', newModel);
  });

  // Switch OpenAI models: Ctrl+Shift+1,2
  const openaiModels = ['o4-mini', 'gpt-4.1'];
  openaiModels.forEach((model, index) => {
    registerShortcut(`CommandOrControl+Shift+${index + 1}`, () => {
      store.set('openaiModel', model);
      log.info(`Switched OpenAI model to: ${model}`);
      notifyRenderer('openai-model-changed', model);
    });
  });

  // Take screenshot: Ctrl+Shift+S
  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    try {
      const screenshotPath = await takeScreenshot();
      addScreenshot(screenshotPath);

      // Notify renderer
      if (mainWindow) {
        mainWindow.webContents.send('screenshot-taken', { path: screenshotPath });
      }
    } catch (error) {
      log.error('Error taking screenshot via shortcut:', error);
      console.error('Error taking screenshot via shortcut:', error);
    }
  });

  // Delete Screenshots: Ctrl+Shift+D
  globalShortcut.register('CommandOrControl+Shift+D', async () => {
    await clearScreenshots();
    if (mainWindow) {
      mainWindow.webContents.send('screenshots-cleared');
    }
  });


  // Move window: Ctrl+Shift+Arrow keys
  globalShortcut.register('CommandOrControl+Shift+Up', () => {
    ipcMain.emit('move-window', null, 'up');
  });

  globalShortcut.register('CommandOrControl+Shift+Down', () => {
    ipcMain.emit('move-window', null, 'down');
  });

  globalShortcut.register('CommandOrControl+Shift+Left', () => {
    ipcMain.emit('move-window', null, 'left');
  });

  globalShortcut.register('CommandOrControl+Shift+Right', () => {
    ipcMain.emit('move-window', null, 'right');
  });

  // Scroll window: Ctrl+Arrow keys
  globalShortcut.register('CommandOrControl+Up', () => {
    if (mainWindow) {
      mainWindow.webContents.send('scroll-content', { direction: 'up' });
    }
  });

  globalShortcut.register('CommandOrControl+Down', () => {
    if (mainWindow) {
      mainWindow.webContents.send('scroll-content', { direction: 'down' });
    }
  });

  // Process screenshots: Ctrl+Shift+P
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    if (mainWindow) {
      mainWindow.webContents.send('process-screenshots');
    }
  });

  // Switch tabs: Ctrl+Shift+Space (forward)
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow) {
      mainWindow.webContents.send('switch-tab', 'next');
    }
  });
  
  // Switch tabs: Ctrl+Shift+Tab (backward)
  globalShortcut.register('CommandOrControl+Shift+Tab', () => {
    if (mainWindow) {
      mainWindow.webContents.send('switch-tab', 'previous');
    }
  });

  // Add Copy to clipboard: Ctrl+Shift+C
  globalShortcut.register('CommandOrControl+Shift+C', () => {
    try {
      if (latestAIResponse) {
        clipboard.writeText(latestAIResponse);
        log.info('Copied latest AI response to clipboard');
        
        // Notify renderer
        if (mainWindow) {
          mainWindow.webContents.send('response-copied-to-clipboard');
        }
      } else {
        log.warn('No AI response available to copy to clipboard');
      }
    } catch (error) {
      log.error('Error copying to clipboard:', error);
      console.error('Error copying to clipboard:', error);
    }
  });

  // Process clipboard text as prompt: Ctrl+Shift+Q
  globalShortcut.register('CommandOrControl+Shift+Q', async () => {
    try {
      const clipboardText = clipboard.readText().trim();
      if (!clipboardText) {
        log.warn('No text found in clipboard');
        return;
      }

      log.info('Processing clipboard text as prompt - showing UI');
      
      // Send event to renderer to process clipboard
      if (mainWindow) {
        mainWindow.webContents.send('process-clipboard-prompt');
      }

    } catch (error) {
      log.error('Error processing clipboard prompt:', error);
      console.error('Error processing clipboard prompt:', error);
    }
  });

  // On macOS, re-create a window when clicking the dock icon if none open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Clean up before quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll();

  // Clean up temp screenshots
  try {
    for (const screenshot of screenshotQueue) {
      if (fs.existsSync(screenshot)) {
        fs.unlinkSync(screenshot);
      }
    }
  } catch (error) {
    log.error('Error cleaning up screenshots:', error);
    console.error('Error cleaning up screenshots:', error);
  }
});
