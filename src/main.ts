import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, globalShortcut, screen, clipboard, dialog } from 'electron';
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
// IPC modules
import { registerFilesIPC } from './main/ipc/files';
import { registerPreferencesIPC } from './main/ipc/preferences';

// Configure logging
electronLog.initialize();
electronLog.transports.file.level = 'info';
const log = electronLog;

// Load environment variables
dotenv.config();

// AI Models Configuration
const AI_CONFIG = {
  gemini: {
    model: "gemini-2.5-flash"
  },
  openai: {
    models: {
      'gpt-5': 'gpt-5',
      'gpt-4.1': 'gpt-4.1'
    },
    default: 'gpt-5'
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

// Active Document Context (set after user uploads a file for Q&A)
let activeDocContext: string | null = null;
let activeDocPath: string | null = null;
const DOC_CONTEXT_MAX_CHARS = 10000; // safety limit to avoid blowing prompt tokens

// Keep a list of imported documents for the UI
type ImportedDoc = { filePath: string; fileName: string; length: number; addedAt: number; context: string };
const importedDocs: ImportedDoc[] = [];

const setActiveDocContext = (text: string, filePath?: string) => {
  try {
    const truncated = text.length > DOC_CONTEXT_MAX_CHARS
      ? `${text.slice(0, DOC_CONTEXT_MAX_CHARS)}\n[Truncated document context]`
      : text;
    activeDocContext = truncated;
    activeDocPath = filePath || null;
    // Upsert into importedDocs list
    if (filePath) {
      const fileName = path.basename(filePath);
      const idx = importedDocs.findIndex((d) => d.filePath === filePath);
      if (idx >= 0) {
        importedDocs[idx] = { ...importedDocs[idx], context: truncated, length: truncated.length };
      } else {
        importedDocs.push({ filePath, fileName, length: truncated.length, addedAt: Date.now(), context: truncated });
      }
    }
    log.info('Active document context set', filePath ? `for: ${filePath}` : '');
    if (mainWindow && !mainWindow.isDestroyed()) {
      const name = filePath ? path.basename(filePath) : 'document';
      mainWindow.webContents.send('toast', `Document context loaded: ${name}`);
    }
  } catch (e) {
    log.warn('Failed setting active document context', e);
  }
};

const clearActiveDocContext = () => {
  activeDocContext = null;
  activeDocPath = null;
  log.info('Cleared active document context');
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('toast', 'Document context cleared');
  }
};

const buildDocContextPrefix = () => {
  if (!activeDocContext) return '';
  const name = activeDocPath ? path.basename(activeDocPath) : 'document';
  return [
    `Use the following DOCUMENT CONTEXT as the primary reference. Prefer answers grounded in it before using screenshots or general knowledge. If the context doesn't cover the answer, say so briefly and proceed.`,
    '',
    `— Document: ${name}`,
    '--- DOCUMENT CONTEXT START ---',
    activeDocContext,
    '--- DOCUMENT CONTEXT END ---'
  ].join('\n');
};

const getImportedDocsForUI = () => {
  return importedDocs.map((d) => ({
    filePath: d.filePath,
    fileName: d.fileName,
    length: d.length,
    addedAt: d.addedAt,
    active: !!activeDocPath && d.filePath === activeDocPath,
  }));
};

// Prompt Generation
const generatePrompt = (answerStyle: string, language: string, question?: string) => {
  const basePrompt = question ? `Question: ${question}` : 'Please analyze these screenshots';
  const docPrefix = buildDocContextPrefix();

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

  const body = prompts[answerStyle as keyof typeof prompts] || prompts.explanation;
  return docPrefix ? `${docPrefix}\n\n${body}` : body;
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

/**
 * Ask about a local file by extracting text locally and querying OpenAI Chat Completions.
 * Supported out of the box: txt, md, csv, json. For pdf/docx, it will attempt dynamic parsing if library exists.
 */
const askAboutFileWithOpenAI = async (filePath: string, question: string): Promise<string> => {
  const openai = getOpenAIClient();
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error('File not found');
  }

  const ext = path.extname(filePath).toLowerCase();

  const readText = async (): Promise<string> => {
    if (['.txt', '.md', '.csv', '.json', '.log'].includes(ext)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    if (ext === '.pdf') {
      // Tier 1: Try pdf-parse (fast, lightweight)
      let ePdfParse: any = null;
      try {
        const mod: any = await import('pdf-parse');
        const pdfParse = mod?.default ?? mod;
        const dataBuffer = await fs.promises.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return (data && (data as any).text) ? (data as any).text : '';
      } catch (e1: any) {
        ePdfParse = e1;
        log.warn('PDF parsing via pdf-parse failed, will try pdfjs-dist fallback:', e1?.message || e1);
      }

      // Tier 2: Try pdfjs-dist legacy v3 path, then normal build
      let ePdfJs: any = null;
      try {
        const bytes = new Uint8Array(await fs.promises.readFile(filePath));

        let pdfjsLib: any = null;
        try {
          // @ts-ignore - dynamic import of legacy build path for Node usage
          pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js');
        } catch (legacyErr: any) {
          log.warn('pdfjs-dist legacy import failed, trying normal build path:', legacyErr?.message || legacyErr);
          // @ts-ignore - dynamic import of normal build as a fallback
          pdfjsLib = await import('pdfjs-dist/build/pdf.js');
        }

        const loadingTask = (pdfjsLib as any).getDocument({
          data: bytes,
          disableWorker: true,
          isEvalSupported: false,
          useSystemFonts: true,
          disableFontFace: true,
        });
        const pdf = (loadingTask as any).promise ? await (loadingTask as any).promise : await (loadingTask as any);
        let allText = '';
        for (let p = 1; p <= (pdf.numPages || 0); p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const strings = (content.items || [])
            .map((it: any) => (it && typeof it.str === 'string') ? it.str : '')
            .filter(Boolean)
            .join(' ');
          allText += `Page ${p}:\n${strings}\n\n`;
        }
        return allText.trim();
      } catch (e2: any) {
        ePdfJs = e2;
        log.error('PDF parsing via pdfjs-dist failed:', e2?.message || e2);
        throw new Error(`PDF parsing failed. Underlying errors => pdf-parse: ${ePdfParse?.message || ePdfParse}; pdfjs-dist: ${ePdfJs?.message || ePdfJs}`);
      }
    }
    if (ext === '.pptx') {
      // Extract text from PPTX by unzipping and reading slide XMLs
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const JSZip = require('jszip');
        const buffer = fs.readFileSync(filePath);
        const zip = await JSZip.loadAsync(buffer);
        const slideNames = Object.keys(zip.files)
          .filter((n: string) => n.startsWith('ppt/slides/slide') && n.endsWith('.xml'))
          .sort((a: string, b: string) => {
            const na = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
            const nb = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0', 10);
            return na - nb;
          });

        const decodeXml = (s: string) =>
          s
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'");

        const slides: string[] = [];
        for (const name of slideNames) {
          const xml = await zip.files[name].async('string');
          const matches = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g));
          const texts = matches
            .map((m) => (Array.isArray(m) ? m[1] : undefined))
            .filter((v): v is string => typeof v === 'string')
            .map((t) => decodeXml(t).trim())
            .filter(Boolean);
          const slideNum = name.match(/slide(\d+)\.xml$/)?.[1] || '?';
          slides.push([`Slide ${slideNum}:`, texts.join(' ')].join('\n'));
        }
        return slides.join('\n\n');
      } catch (e) {
        throw new Error('PPTX support requires "jszip". Run: npm install jszip');
      }
    }
    throw new Error(`Unsupported file type: ${ext}`);
  };

  const text = (await readText()).trim();
  if (!text) {
    throw new Error('File has no extractable text');
  }

  // Limit extremely large inputs to avoid token errors
  const MAX_CHARS = 80_000; // ~ small safety; adjust per model
  const truncated = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n[Truncated for length]` : text;

  // Set active document context for subsequent prompts
  setActiveDocContext(truncated, filePath);

  // If no question provided, only set context and return a friendly status message (no AI call)
  if (!question || !question.trim()) {
    const fileName = path.basename(filePath);
    return `Document context loaded: ${fileName} (${truncated.length} chars). Ask a question to get an answer based on this document.`;
  }

  const prompt = [
    'You are a helpful assistant. Read the following document content and answer the user question.',
    'If the content seems truncated, note that in your answer.',
    '',
    '--- DOCUMENT START ---',
    truncated,
    '--- DOCUMENT END ---',
    '',
    `Question: ${question || 'Summarize the document and list key points.'}`,
  ].join('\n');

  const response = await openai.chat.completions.create({
    model: getCurrentOpenAIModel(),
    messages: [{ role: 'user', content: prompt }],
  });

  const answer = response.choices[0]?.message?.content || 'No answer';
  latestAIResponse = answer;
  autoShowOverlay(latestAIResponse, 2000);
  return answer;
};

// Register Files IPC (preserves public channels)
registerFilesIPC(ipcMain, { dialog, log, askAboutFileWithOpenAI });

// Global variables
let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlayPinned: boolean = false;
let overlayAutoHideTimer: NodeJS.Timeout | null = null;
let screenshotQueue: string[] = [];
const tempDir = path.join(os.tmpdir(), 'open-interview-coder');

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Keep track of the current ignore state
let isIgnoringMouseEvents = true;
let isWindowVisible = false;

// Helper function to check if file is in use
const isFileInUse = (filePath: string): boolean => {
  try {
    if (!fs.existsSync(filePath)) return false;
    
    // Try to open file for writing (exclusive access)
    const fd = fs.openSync(filePath, 'r+');
    fs.closeSync(fd);
    return false; // File is not in use
  } catch (error) {
    return true; // File is in use
  }
};

// Helper function to safely delete files on Windows
const safeDeleteFile = (filePath: string, retryCount = 0) => {
  try {
    if (fs.existsSync(filePath)) {
      // Check if file is in use
      if (isFileInUse(filePath)) {
        if (retryCount < 3) {
          const delay = (retryCount + 1) * 1000;
          log.warn(`File is in use (attempt ${retryCount + 1}), retrying in ${delay}ms...`);
          setTimeout(() => {
            safeDeleteFile(filePath, retryCount + 1);
          }, delay);
          return;
        } else {
          log.error(`File still in use after ${retryCount + 1} attempts: ${filePath}`);
          pendingDeletes.add(filePath);
          return;
        }
      }
      
      fs.unlinkSync(filePath);
      log.info(`Successfully deleted file: ${filePath}`);
    }
  } catch (error) {
    if (retryCount < 3) {
      const delay = (retryCount + 1) * 1000;
      log.warn(`Failed to delete file (attempt ${retryCount + 1}), retrying in ${delay}ms...`);
      setTimeout(() => {
        safeDeleteFile(filePath, retryCount + 1);
      }, delay);
    } else {
      log.error(`Failed to delete file after ${retryCount + 1} attempts: ${filePath}`);
      pendingDeletes.add(filePath);
    }
  }
};

// Track files that couldn't be deleted for cleanup later
const pendingDeletes = new Set<string>();

// Add a variable to store the latest AI response
let latestAIResponse: string = '';

// Helper function to notify renderer
const notifyRenderer = (event: string, data?: any) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, data);
  }
};

// Helper to create/update a tiny overlay window showing latest answer
function createOrGetOverlayWindow(): BrowserWindow {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const overlayWidth = 600;
  const overlayHeight = 220;
  const margin = 16;

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: width - overlayWidth - margin,
    y: height - overlayHeight - margin,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
    preload: path.join(__dirname, 'preload', 'index.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
  });

  // Make it click-through
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.setContentProtection(true);
  overlayWindow.setAlwaysOnTop(true, 'screen-saver', 2);
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const overlayHTML = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset=\"utf-8\" />
        <style>
          html, body { margin: 0; padding: 0; background: transparent; }
          .wrap {
            position: fixed;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: flex-end;
            justify-content: flex-end;
            pointer-events: none; /* container remains non-interactive; we toggle window interactivity from main */
          }
          .bubble {
            pointer-events: auto; /* allow interactions when window interactivity is enabled */
            max-width: 100%;
            max-height: 100%;
            color: #ffffff;
            font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\";
            font-size: 16px;
            line-height: 1.5;
            /* extra top padding for more breathing room */
            padding: 18px 14px 12px 14px;
            margin: 10px;
            backdrop-filter: blur(12px);
            background: rgba(100, 100, 100, 0.42);
            border-radius: 10px;
            white-space: pre; /* prevent wrapping so one physical line = one display line */
            overflow-wrap: normal;
            overflow-y: hidden; /* always hidden — we scroll programmatically */
            overflow-x: hidden;
            /* hide scrollbars in Chromium */
          }
          .bubble::-webkit-scrollbar {
            width: 0px;
            height: 0px;
          }
          .bubble {
            -ms-overflow-style: none; /* IE/Edge */
            scrollbar-width: none;    /* Firefox */
          }
        </style>
      </head>
      <body>
        <div class=\"wrap\">
          <div id=\"text\" class=\"bubble\"></div>
        </div>
        <script>
          const el = document.getElementById('text');

          const getLineHeightPx = () => {
            const cs = window.getComputedStyle(el);
            const lh = parseFloat(cs.lineHeight);
            if (!isNaN(lh) && lh > 0) return lh;
            const fs = parseFloat(cs.fontSize) || 16;
            return fs * 1.5; // fallback if line-height is 'normal'
          };

          const setSingleLineViewport = () => {
            const lh = getLineHeightPx();
            // lock line-height and height to exactly one line in pixels
            el.style.lineHeight = lh + 'px';
            el.style.height = lh + 'px'; // viewport exactly one line
            el.style.overflowY = 'hidden';
            // snap to top when content updates
            el.scrollTop = 0;
          };

          const update = (t) => {
            el.textContent = (t || '').trim();
            setSingleLineViewport();
          };
          if (window.electronAPI && window.electronAPI.onOverlayUpdate) {
            window.electronAPI.onOverlayUpdate((t) => update(t));
          }
          // Set initial empty
          update('');

          // Support Ctrl + mouse wheel scrolling when content exceeds bounds
          let hideOverflowTimer = null;
          window.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return; // only scroll when Ctrl is held
            e.preventDefault();
            e.stopPropagation();
            const lh = getLineHeightPx();
            if (!lh || lh <= 0) return;
            const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
            const step = (e.deltaY || 0) > 0 ? lh : -lh; // one line per wheel tick
            let nextTop = el.scrollTop + step;
            if (nextTop < 0) nextTop = 0;
            if (nextTop > maxTop) nextTop = maxTop;
            // snap to line boundary
            nextTop = Math.round(nextTop / lh) * lh;
            el.scrollTop = nextTop;
            // auto-disable overflow after a short idle
            if (hideOverflowTimer) clearTimeout(hideOverflowTimer);
            hideOverflowTimer = setTimeout(() => {
              el.style.overflowY = 'hidden';
            }, 400);
          }, { passive: false });

          // Recompute viewport on resize
          window.addEventListener('resize', setSingleLineViewport);
        </script>
      </body>
    </html>
  `;

  overlayWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(overlayHTML));

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

function updateOverlay(text?: string) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('overlay-update', text ?? latestAIResponse);
}

function showOverlay(text?: string) {
  const win = createOrGetOverlayWindow();
  if (!win.isVisible()) {
    win.showInactive();
  }
  updateOverlay(text);
}

function hideOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

function autoShowOverlay(text?: string, durationMs: number = 2000) {
  showOverlay(text);
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

// Enable/disable overlay interactivity (for scrolling when pinned)
function setOverlayInteractive(enabled: boolean) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  try {
    overlayWindow.setIgnoreMouseEvents(!enabled, { forward: true });
  } catch {}
}

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
      preload: path.join(__dirname, 'preload', 'index.js'),
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
    if (oldScreenshot) {
      safeDeleteFile(oldScreenshot);
    }
  }
};

// Import image from clipboard as screenshot
async function importClipboardImage(): Promise<{ success: boolean; path?: string; error?: string }> {
  try {
    const img = clipboard.readImage();
    // NativeImage may be empty if clipboard has no image
    if (!img || img.isEmpty()) {
      const errorMsg = 'Clipboard does not contain an image';
      log.warn(errorMsg);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('toast', errorMsg);
      }
      return { success: false, error: errorMsg };
    }

    const pngBuffer = img.toPNG();
    const filePath = path.join(tempDir, `snipt-${Date.now()}.png`);
    await fs.promises.writeFile(filePath, pngBuffer);

    addScreenshot(filePath);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('screenshot-taken', { path: filePath, source: 'clipboard' });
    }

    log.info(`Imported clipboard image to ${filePath}`);
    return { success: true, path: filePath };
  } catch (error) {
    const msg = `Failed to import clipboard image: ${(error as Error).message}`;
    log.error(msg);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('toast', msg);
    }
    return { success: false, error: msg };
  }
}

const clearScreenshots = async () => {
  const screenshotsDir = path.join(os.tmpdir(), 'open-interview-coder');
  try {
    const files = await fs.promises.readdir(screenshotsDir);
    await Promise.all(files.map(file => 
      safeDeleteFile(path.join(screenshotsDir, file))
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
    const docPrefix = buildDocContextPrefix();
    const finalPrompt = docPrefix ? `${docPrefix}\n\n${prompt}` : prompt;
    const result = await sendPromptToGemini([finalPrompt])

    const assistantReply = result.text || 'No response from Google Gemini.';
    
    // Store the latest response
    latestAIResponse = assistantReply;
    autoShowOverlay(assistantReply, 2000);

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
    const docPrefix = buildDocContextPrefix();
    const finalPrompt = docPrefix ? `${docPrefix}\n\n${prompt}` : prompt;
    const assistantReply = await sendPromptToOpenAI(finalPrompt);
    
    // Store the latest response
    latestAIResponse = assistantReply;
    autoShowOverlay(assistantReply, 2000);

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

  // Generate prompt using centralized function (includes doc context if available)
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
      }
    }

    log.info('Sending request to Google Gemini API with images');

    // Make a request to Gemini with images
    const result = await sendPromptToGemini(parts);

    const analysis = result.text || 'Analysis completed, but no specific solution was generated.';
    
    // Store the latest response
    latestAIResponse = analysis;
    autoShowOverlay(analysis, 2000);

    log.info('Received analysis from Google Gemini API');

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
    const answerStyle = store.get('answerStyle') || 'code';
  // Build prompt using centralized generator with current style (includes doc context if available)
  const promptText = generatePrompt(answerStyle, language);

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
      }
    }

    log.info('Sending request to OpenAI API with images');

    // Make a request to OpenAI with images
    const response = await openai.chat.completions.create({
      model: getCurrentOpenAIModel(),
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
    autoShowOverlay(analysis, 2000);

    log.info('Received analysis from OpenAI API');

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

// Register Preferences IPC (preserves public channels)
registerPreferencesIPC(ipcMain, { store, log, getApiKey });

ipcMain.handle('get-screenshots', () => {
  return screenshotQueue;
});

// Document context utilities
ipcMain.handle('clearActiveDocContext', () => {
  clearActiveDocContext();
  return { success: true };
});

ipcMain.handle('getActiveDocInfo', () => {
  if (!activeDocContext) return { hasContext: false };
  return {
    hasContext: true,
    fileName: activeDocPath ? path.basename(activeDocPath) : undefined,
    length: activeDocContext.length
  };
});

ipcMain.handle('docs:list', () => {
  return { success: true, docs: getImportedDocsForUI() };
});

ipcMain.handle('docs:setActive', (_e, filePath: string) => {
  try {
    const found = importedDocs.find((d) => d.filePath === filePath);
    if (!found) return { success: false, error: 'Document not found' };
    setActiveDocContext(found.context, found.filePath);
    return { success: true };
  } catch (err: any) {
    log.error('docs:setActive error', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('docs:remove', (_e, filePath: string) => {
  try {
    const idx = importedDocs.findIndex((d) => d.filePath === filePath);
    if (idx < 0) return { success: false, error: 'Document not found' };
    // If removing the active doc, clear active context
    const wasActive = activeDocPath && importedDocs[idx].filePath === activeDocPath;
    importedDocs.splice(idx, 1);
    if (wasActive) clearActiveDocContext();
    return { success: true };
  } catch (err: any) {
    log.error('docs:remove error', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('remove-screenshot', (_event: IpcMainInvokeEvent, index: number) => {
  try {
    if (index >= 0 && index < screenshotQueue.length) {
      const screenshotPath = screenshotQueue[index];
      screenshotQueue.splice(index, 1);
      safeDeleteFile(screenshotPath);

      return { success: true };
    }
    return { success: false, error: 'Invalid screenshot index' };
  } catch (error) {
    log.error('Error removing screenshot:', error);
    console.error('Error removing screenshot:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Import clipboard image IPC
ipcMain.handle('import-clipboard-image', async () => {
  return await importClipboardImage();
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

// Add text extraction handler
ipcMain.handle('extractTextFromScreenshots', async () => {
  if (screenshotQueue.length === 0) {
    const errorMsg = 'No screenshots available to extract text from';
    log.error(errorMsg);
    console.error(errorMsg);
    return { success: false, error: errorMsg };
  }

  try {
    log.info('Extracting text from screenshots');

    const openai = getOpenAIClient();
    
    // Prepare screenshots for text extraction
    const screenshots = [...screenshotQueue];

    // Simple prompt for text extraction only
    const extractPrompt = `Please extract and list all the text you can see in these screenshots. Only return the extracted text, no analysis or explanation.

[EXTRACTED TEXT]`;

    // Convert images to base64 and create message content
    const content: ChatCompletionContentPart[] = [
      { type: "text", text: extractPrompt }
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

    log.info('Sending text extraction request to OpenAI API');

    // Make a request to OpenAI for text extraction only
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      messages: [
        {
          role: 'user',
          content: content
        }
      ],
    });

    const extractedText = response.choices[0]?.message?.content || 'No text extracted';
    
    // Copy extracted text to clipboard
    clipboard.writeText(extractedText);
    
    log.info('Text extracted and copied to clipboard');

    // Automatically trigger processing clipboard prompt (same as Ctrl+Shift+Q)
    if (mainWindow) {
      try {
        mainWindow.webContents.send('process-clipboard-prompt');
        log.info('Triggered processing of clipboard prompt after text extraction');
      } catch (e) {
        log.error('Failed to trigger clipboard prompt processing:', e);
      }
    }

    return {
      success: true,
      extractedText: extractedText
    };
  } catch (error) {
    log.error('Error extracting text from screenshots:', error);
    console.error('Error extracting text from screenshots:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Add region screenshot handler
ipcMain.handle('take-region-screenshot', async () => {
  try {
    log.info('Starting region screenshot capture');
    
    // Hide main window temporarily
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }
    
    // Wait a bit for window to hide
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Take full screenshot first
    const fullScreenshotPath = await takeScreenshot();
    
    // Create region selection window (INVINCIBLE)
    const regionWindow = new BrowserWindow({
      fullscreen: true,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,           // Prevent focus stealing
      closable: false,            // Prevent window close
      minimizable: false,         // Prevent minimize
      maximizable: false,         // Prevent maximize
      resizable: false,           // Prevent resize
      movable: false,             // Prevent move
      show: false,                // Don't show until ready
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      preload: path.join(__dirname, 'preload', 'index.js')
          }
    });

    // Make it truly invincible
    regionWindow.setAlwaysOnTop(true, 'screen-saver');  // Highest priority
    regionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    
    // Prevent any window management
    regionWindow.on('close', (e: Electron.Event) => {
      e.preventDefault();
      log.warn('Region window close attempt prevented');
    });
    
    regionWindow.on('minimize', (e: Electron.Event) => {
      e.preventDefault();
      log.warn('Region window minimize attempt prevented');
    });
    
    regionWindow.on('maximize', (e: Electron.Event) => {
      e.preventDefault();
      log.warn('Region window maximize attempt prevented');
    });
    
    regionWindow.on('restore', (e: Electron.Event) => {
      e.preventDefault();
      log.warn('Region window restore attempt prevented');
    });
    
    regionWindow.on('move', (e: Electron.Event) => {
      e.preventDefault();
      log.warn('Region window move attempt prevented');
    });
    
    regionWindow.on('resize', (e: Electron.Event) => {
      e.preventDefault();
      log.warn('Region window resize attempt prevented');
    });
    
    // Show window after setup
    regionWindow.show();
    
    // Load region selection HTML (invisible overlay - no visible UI)
    const regionSelectionHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            cursor: crosshair;
            user-select: none;
            background: transparent;
            overflow: hidden;
            -webkit-app-region: no-drag; /* Prevent window dragging */
          }
          
          /* Prevent context menu */
          * {
            -webkit-user-select: none;
            -moz-user-select: none;
            -ms-user-select: none;
            user-select: none;
          }
          
          .selection-box {
            position: absolute;
            border: none;
            background: transparent;
            display: none; /* keep fully invisible */
            z-index: 1000;
          }
        </style>
      </head>
      <body>
        <div class="selection-box" id="selectionBox"></div>
        
        <script>
          // Prevent all keyboard shortcuts and context menu
          document.addEventListener('contextmenu', (e) => e.preventDefault());
          document.addEventListener('keydown', (e) => {
            // Only allow ESC key
            if (e.key !== 'Escape') {
              e.preventDefault();
              e.stopPropagation();
            }
          });
          
          // Prevent window focus loss
          window.addEventListener('blur', () => {
            window.focus();
          });
          
          let isSelecting = false;
          let startX, startY, endX, endY;
          const selectionBox = document.getElementById('selectionBox');
          
          document.addEventListener('mousedown', (e) => {
            isSelecting = true;
            startX = e.clientX;
            startY = e.clientY;
            // invisible flow: do not show selection box
          });
          
          document.addEventListener('mousemove', (e) => {
            if (!isSelecting) return;
            
            endX = e.clientX;
            endY = e.clientY;
            
            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);
            
            // invisible flow: do not update selection box visuals
          });
          
          document.addEventListener('mouseup', (e) => {
            if (!isSelecting) return;
            isSelecting = false;
            
            endX = e.clientX;
            endY = e.clientY;
            
            const left = Math.min(startX, endX);
            const top = Math.min(startY, endY);
            const width = Math.abs(endX - startX);
            const height = Math.abs(endY - startY);
            
            if (width > 10 && height > 10) {
              window.electronAPI.captureRegion({
                x: left,
                y: top,
                width: width,
                height: height
              });
            }
          });
          
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              window.electronAPI.cancelRegionScreenshot();
            }
          });
        </script>
      </body>
      </html>
    `;
    
    await regionWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(regionSelectionHTML));
    
    return new Promise((resolve, reject) => {
      // Handle region capture
      ipcMain.once('capture-region', async (event, region) => {
        try {
          regionWindow.destroy();
          
          // Crop the screenshot
          const sharp = require('sharp');
          const croppedPath = path.join(tempDir, `region-screenshot-${Date.now()}.png`);
          
          await sharp(fullScreenshotPath)
            .extract({
              left: Math.round(region.x),
              top: Math.round(region.y),
              width: Math.round(region.width),
              height: Math.round(region.height)
            })
            .png()
            .toFile(croppedPath);
          
          // Clean up full screenshot with delay to ensure AI processing is complete
          setTimeout(() => {
            safeDeleteFile(fullScreenshotPath);
          }, 2000); // Wait 2 seconds before attempting deletion
          
          addScreenshot(croppedPath);
          
          // Show main window again
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
          }
          
          // Notify renderer
          if (mainWindow) {
            mainWindow.webContents.send('screenshot-taken', { path: croppedPath });
          }
          
          resolve({ success: true, path: croppedPath });
        } catch (error) {
          regionWindow.destroy();
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
          }
          reject(error);
        }
      });
      
      // Handle cancel
      ipcMain.once('cancel-region-screenshot', () => {
        regionWindow.destroy();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
        }
        // Clean up full screenshot with delay
        setTimeout(() => {
          safeDeleteFile(fullScreenshotPath);
        }, 1000);
        resolve({ success: false, cancelled: true });
      });
    });
    
  } catch (error) {
    log.error('Error taking region screenshot:', error);
    console.error('Error taking region screenshot:', error);
    
    // Make sure main window is shown again
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
    
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
    if (!clipboardText) {
      return { success: false, error: 'No text found in clipboard' };
    }

    log.info('Processing clipboard text as prompt via IPC');
    
    const defaultModel = store.get('defaultModel') || 'both';
    const answerStyle = store.get('answerStyle', 'explanation');
    const language = store.get('preferredLanguage') || 'python';
    // Build prompt using centralized generator; it automatically injects
    // document context if available and instructs to base answers on it
    const promptText = generatePrompt(answerStyle, language, clipboardText);

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
            autoShowOverlay(response, 2000);
            log.info('OpenAI response received from clipboard prompt');
            return response;
          })
          .catch((error: Error) => {
            openaiResponse = `OpenAI Error: ${error.message}`;
            log.error('OpenAI error from clipboard prompt:', error);
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
            autoShowOverlay(response, 2000);
            log.info('Gemini response received from clipboard prompt');
            return response;
          })
          .catch((error: Error) => {
            geminiResponse = `Gemini Error: ${error.message}`;
            log.error('Gemini error from clipboard prompt:', error);
            return geminiResponse;
          })
      );
    }

    // Wait for all requests to complete
    await Promise.allSettled(promises);

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

  // Toggle minimal answer overlay: Ctrl+Shift+O
  globalShortcut.register('CommandOrControl+Shift+O', () => {
    try {
      if (overlayWindow && overlayWindow.isVisible()) {
        hideOverlay();
        overlayPinned = false;
        if (overlayAutoHideTimer) {
          clearTimeout(overlayAutoHideTimer);
          overlayAutoHideTimer = null;
        }
        // Disable interactivity when overlay is not pinned
        setOverlayInteractive(false);
      } else {
        showOverlay(latestAIResponse);
        overlayPinned = true;
        if (overlayAutoHideTimer) {
          clearTimeout(overlayAutoHideTimer);
          overlayAutoHideTimer = null;
        }
        // Enable interactivity while pinned so user can Ctrl+wheel scroll
        setOverlayInteractive(true);
      }
    } catch (e) {
      log.error('Error toggling overlay window:', e);
    }
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
  const openaiModels = ['gpt-5', 'gpt-4.1'];
  openaiModels.forEach((model, index) => {
    registerShortcut(`CommandOrControl+Shift+${index + 1}`, () => {
      store.set('openaiModel', model);
      log.info(`Switched OpenAI model to: ${model}`);
      notifyRenderer('openai-model-changed', model);
    });
  });

  // Full screenshot: Ctrl+Shift+S
  globalShortcut.register('CommandOrControl+Shift+S', async () => {
    try {
      log.info('Taking full screenshot via shortcut');
      const screenshotPath = await takeScreenshot();
      addScreenshot(screenshotPath);

      // Notify renderer
      if (mainWindow) {
        mainWindow.webContents.send('screenshot-taken', { path: screenshotPath });
      }
    } catch (error) {
      log.error('Error taking full screenshot via shortcut:', error);
      console.error('Error taking full screenshot via shortcut:', error);
    }
  });

  // Region screenshot: Ctrl+Shift+Z
  globalShortcut.register('CommandOrControl+Shift+Z', async () => {
    try {
      log.info('Taking region screenshot via shortcut');
      if (mainWindow) {
        mainWindow.webContents.send('trigger-region-screenshot');
      }
    } catch (error) {
      log.error('Error taking region screenshot via shortcut:', error);
      console.error('Error taking region screenshot via shortcut:', error);
    }
  });

  // Extract text from screenshots: Ctrl+Shift+X
  globalShortcut.register('CommandOrControl+Shift+X', async () => {
    try {
      log.info('Extracting text from screenshots via shortcut');
      if (mainWindow) {
        mainWindow.webContents.send('extract-text-from-screenshots');
      }
    } catch (error) {
      log.error('Error extracting text via shortcut:', error);
      console.error('Error extracting text via shortcut:', error);
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
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('process-clipboard-prompt');
      }
    } catch (error) {
      log.error('Error processing clipboard prompt:', error);
      console.error('Error processing clipboard prompt:', error);
    }
  });

  // Import clipboard image and optionally extract: Ctrl+Shift+V
  globalShortcut.register('CommandOrControl+Shift+V', async () => {
    try {
      const res = await importClipboardImage();
      if (!res.success) {
        log.warn(res.error || 'No image in clipboard');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('toast', res.error || 'No image in clipboard');
        }
        return;
      }
      // Optional: trigger extraction pipeline
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('extract-text-from-screenshots');
      }
    } catch (e) {
      log.error('Error importing clipboard image via shortcut:', e);
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
      try {
        if (fs.existsSync(screenshot)) {
          fs.unlinkSync(screenshot);
          log.info(`Cleaned up screenshot: ${screenshot}`);
        }
      } catch (error) {
        log.warn(`Couldn't delete screenshot on exit: ${screenshot}`, error);
      }
    }
    
    // Clean up pending deletes
    for (const pendingFile of pendingDeletes) {
      try {
        if (fs.existsSync(pendingFile)) {
          fs.unlinkSync(pendingFile);
          log.info(`Cleaned up pending file: ${pendingFile}`);
        }
      } catch (error) {
        log.warn(`Still couldn't delete file on exit: ${pendingFile}`, error);
      }
    }
  } catch (error) {
    log.error('Error cleaning up screenshots:', error);
    console.error('Error cleaning up screenshots:', error);
  }
});
