// path: src/renderer/index.ts
// NOTE: This file ports the inline script from index.html as-is to keep behavior.
// It does not use module imports to avoid requiring a bundler; relies on globals (marked, hljs).

function isHighlightJsLoaded() {
  return typeof (window as any).hljs !== 'undefined';
}

function renderMarkdown(text: string): string {
  try {
    if (typeof (window as any).marked !== 'undefined') {
      // Protect math blocks with unique markers that won't be escaped
      const mathBlocks: Array<{original: string, isDisplay: boolean}> = [];
      
      // Extract display math blocks ($$...$$) first (greedy for multiline)
      let processedText = text.replace(/\$\$([\s\S]+?)\$\$/g, (match) => {
        const index = mathBlocks.length;
        mathBlocks.push({original: match, isDisplay: true});
        return `<span class="math-placeholder" data-math-id="${index}"></span>`;
      });
      
      // Extract inline math ($...$) - non-greedy, no newlines
      processedText = processedText.replace(/\$([^\$\n]+?)\$/g, (match) => {
        const index = mathBlocks.length;
        mathBlocks.push({original: match, isDisplay: false});
        return `<span class="math-placeholder" data-math-id="${index}"></span>`;
      });
      
      (window as any).marked.setOptions({
        highlight: function (code: string, lang: string) {
          if (!isHighlightJsLoaded()) {
            console.warn('Highlight.js is not loaded yet');
            return code;
          }
          try {
            const hljs = (window as any).hljs;
            if (lang && hljs.getLanguage(lang)) {
              return hljs.highlight(code, { language: lang }).value;
            } else {
              return hljs.highlightAuto(code).value;
            }
          } catch (e) {
            console.error('Error highlighting code:', e);
            return code;
          }
        },
        breaks: true,
        gfm: true,
      });
      
      // Parse markdown
      let html = (window as any).marked.parse(processedText);
      
      // Create a temporary container
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      
      // Restore math blocks by replacing placeholders
      const placeholders = tempDiv.querySelectorAll('.math-placeholder');
      placeholders.forEach((placeholder) => {
        const mathId = placeholder.getAttribute('data-math-id');
        if (mathId !== null) {
          const index = parseInt(mathId);
          const mathBlock = mathBlocks[index];
          if (mathBlock) {
            const mathSpan = document.createElement('span');
            mathSpan.textContent = mathBlock.original; // Set as text to preserve $ characters
            placeholder.replaceWith(mathSpan);
          }
        }
      });
      
      // Now render math with KaTeX
      if (typeof (window as any).renderMathInElement !== 'undefined') {
        try {
          (window as any).renderMathInElement(tempDiv, {
            delimiters: [
              {left: '$$', right: '$$', display: true},
              {left: '$', right: '$', display: false}
            ],
            throwOnError: false,
            trust: true
          });
        } catch (e) {
          console.warn('KaTeX rendering failed:', e);
        }
      }
      
      return tempDiv.innerHTML;
    }
    return text;
  } catch (e: any) {
    console.error('Markdown parsing error:', e);
    return `<p>Error rendering markdown: ${e.message}</p><pre>${text}</pre>`;
  }
}

// DOM Elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const minimizeBtn = document.getElementById('minimizeBtn') as HTMLButtonElement;
const closeBtn = document.getElementById('closeBtn') as HTMLButtonElement;
const userInput = document.getElementById('userInput') as HTMLInputElement;
const sendBtn = document.getElementById('sendBtn') as HTMLButtonElement;
const clipboardPromptBtn = document.getElementById('clipboardPromptBtn') as HTMLButtonElement;
const fullScreenshotBtn = document.getElementById('fullScreenshotBtn') as HTMLButtonElement;
const regionScreenshotBtn = document.getElementById('regionScreenshotBtn') as HTMLButtonElement;
const extractTextBtn = document.getElementById('extractTextBtn') as HTMLButtonElement;
const openaiResponseContainer = document.getElementById('openaiResponseContainer') as HTMLElement;
const geminiResponseContainer = document.getElementById('geminiResponseContainer') as HTMLElement;
const responsesContainer = document.getElementById('responsesContainer') as HTMLElement;
const showBothBtn = document.getElementById('showBothBtn') as HTMLButtonElement;
const showOpenAIBtn = document.getElementById('showOpenAIBtn') as HTMLButtonElement;
const showGeminiBtn = document.getElementById('showGeminiBtn') as HTMLButtonElement;
const processScreenshotsBtn = document.getElementById('processScreenshotsBtn') as HTMLButtonElement;
const screenshotList = document.getElementById('screenshotList') as HTMLElement;
const toast = document.getElementById('toast') as HTMLElement;
const apiKeyInput = document.getElementById('apiKey') as HTMLInputElement;
const geminiApiKeyInput = document.getElementById('geminiApiKey') as HTMLInputElement;
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn') as HTMLButtonElement;
const preferredLanguageSelect = document.getElementById('preferredLanguage') as HTMLSelectElement;
const defaultModelSelect = document.getElementById('defaultModel') as HTMLSelectElement;
const answerStyleSelect = document.getElementById('answerStyle') as HTMLSelectElement;
const openaiModelSelect = document.getElementById('openaiModel') as HTMLSelectElement;
const savePreferencesBtn = document.getElementById('savePreferencesBtn') as HTMLButtonElement;

function switchTab(tabName: string) {
  tabs.forEach((t) => t.classList.remove('active'));
  tabContents.forEach((c) => c.classList.remove('active'));
  (document.querySelector(`[data-tab="${tabName}"]`) as HTMLElement).classList.add('active');
  (document.querySelector(`[data-tab-content="${tabName}"]`) as HTMLElement).classList.add('active');
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.getAttribute('data-tab')!;
    switchTab(tabName);
  });
});

// Window controls
minimizeBtn.addEventListener('click', () => window.electronAPI.hideWindow());
closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

// Send prompt to models
sendBtn.addEventListener('click', async () => {
  const prompt = userInput.value.trim();
  if (!prompt) return;
  const defaultModel = await window.electronAPI.getDefaultModel();

  if (defaultModel === 'both' || defaultModel === 'openai') {
    openaiResponseContainer.innerHTML = '<p>Loading...</p>';
  } else {
    openaiResponseContainer.innerHTML = '<p>OpenAI model not selected</p>';
  }
  if (defaultModel === 'both' || defaultModel === 'gemini') {
    geminiResponseContainer.innerHTML = '<p>Loading...</p>';
  } else {
    geminiResponseContainer.innerHTML = '<p>Gemini model not selected</p>';
  }

  try {
    const promptPromises: Promise<any>[] = [];
    if (defaultModel === 'both' || defaultModel === 'openai') {
      promptPromises.push(window.electronAPI.sendPromptToOpenAI(prompt));
    } else {
      promptPromises.push(Promise.resolve('Model not selected'));
    }
    if (defaultModel === 'both' || defaultModel === 'gemini') {
      promptPromises.push(window.electronAPI.sendPromptToGemini(prompt));
    } else {
      promptPromises.push(Promise.resolve('Model not selected'));
    }

    const [openaiReply, geminiReply] = await Promise.allSettled(promptPromises);
    if (defaultModel === 'both' || defaultModel === 'openai') {
      if (openaiReply.status === 'fulfilled') openaiResponseContainer.innerHTML = renderMarkdown(openaiReply.value);
      else openaiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${(openaiReply as any).reason?.message || 'Failed to get response'}`);
    }
    if (defaultModel === 'both' || defaultModel === 'gemini') {
      if (geminiReply.status === 'fulfilled') geminiResponseContainer.innerHTML = renderMarkdown((geminiReply as any).value);
      else geminiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${(geminiReply as any).reason?.message || 'Failed to get response'}`);
    }

    if (isHighlightJsLoaded()) {
      try { document.querySelectorAll('pre code').forEach((block) => (window as any).hljs.highlightElement(block as any)); } catch (e) { console.error('HLJS error:', e); }
    }
  } catch (error: any) {
    if (defaultModel === 'both' || defaultModel === 'openai') openaiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${error.message}`);
    if (defaultModel === 'both' || defaultModel === 'gemini') geminiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${error.message}`);
  }
});

userInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });

// Clipboard prompt
clipboardPromptBtn.addEventListener('click', async () => {
  try {
    showToast('Processing clipboard text...');
    openaiResponseContainer.innerHTML = '<p>Processing clipboard text...</p>';
    geminiResponseContainer.innerHTML = '<p>Processing clipboard text...</p>';

    const result = await window.electronAPI.processClipboardPrompt();
    if (result.success) {
      userInput.value = result.prompt || '';
      if (result.openaiResponse) openaiResponseContainer.innerHTML = renderMarkdown(result.openaiResponse);
      else openaiResponseContainer.innerHTML = '<p>OpenAI model not selected or failed</p>';
      if (result.geminiResponse) geminiResponseContainer.innerHTML = renderMarkdown(result.geminiResponse);
      else geminiResponseContainer.innerHTML = '<p>Gemini model not selected or failed</p>';
      if (isHighlightJsLoaded()) { try { document.querySelectorAll('pre code').forEach((block) => (window as any).hljs.highlightElement(block as any)); } catch (e) { console.error('HLJS error:', e); } }
      showToast('Clipboard processed and copied!');
    } else {
      openaiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${result.error}`);
      geminiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${result.error}`);
      showToast(`Error: ${result.error}`);
    }
  } catch (error: any) {
    openaiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${error.message}`);
    geminiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${error.message}`);
    showToast(`Error: ${error.message}`);
  }
});

// Full screenshot
fullScreenshotBtn.addEventListener('click', async () => {
  try { const result = await window.electronAPI.takeScreenshot(); if (result.success) await updateScreenshotList(); } catch (e: any) { showToast(`Error: ${e.message}`); }
});

// Extract text
extractTextBtn.addEventListener('click', async () => {
  try { const result = await window.electronAPI.extractTextFromScreenshots(); if (result.success) { userInput.value = result.extractedText.substring(0, 100) + '...'; } else { showToast(`Error: ${result.error}`); } } catch (e: any) { showToast(`Error: ${e.message}`); }
});

// Process screenshots
processScreenshotsBtn.addEventListener('click', async () => {
  try {
    const language = preferredLanguageSelect.value;
    const defaultModel = await window.electronAPI.getDefaultModel();
    showToast('Processing screenshots...');
    switchTab('prompt');
    if (defaultModel === 'both' || defaultModel === 'openai') openaiResponseContainer.innerHTML = '<p>Analyzing screenshots with OpenAI...</p>'; else openaiResponseContainer.innerHTML = '<p>OpenAI model not selected</p>';
    if (defaultModel === 'both' || defaultModel === 'gemini') geminiResponseContainer.innerHTML = '<p>Analyzing screenshots with Gemini...</p>'; else geminiResponseContainer.innerHTML = '<p>Gemini model not selected</p>';

    const analysisPromises: Promise<any>[] = [];
    if (defaultModel === 'both' || defaultModel === 'openai') analysisPromises.push(window.electronAPI.analyzeScreenshotsWithOpenAI({ language })); else analysisPromises.push(Promise.resolve({ success: false, error: 'Model not selected' }));
    if (defaultModel === 'both' || defaultModel === 'gemini') analysisPromises.push(window.electronAPI.analyzeScreenshotsWithGemini({ language })); else analysisPromises.push(Promise.resolve({ success: false, error: 'Model not selected' }));

    const [openaiResult, geminiResult] = await Promise.allSettled(analysisPromises);
    if (defaultModel === 'both' || defaultModel === 'openai') {
      if (openaiResult.status === 'fulfilled' && (openaiResult as any).value.success) openaiResponseContainer.innerHTML = renderMarkdown((openaiResult as any).value.analysis || 'Analysis completed, but no specific solution was generated.');
      else openaiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${((openaiResult as any).reason?.message) || ((openaiResult as any).value?.error) || 'Failed to analyze screenshots'}`);
    }
    if (defaultModel === 'both' || defaultModel === 'gemini') {
      if (geminiResult.status === 'fulfilled' && (geminiResult as any).value.success) geminiResponseContainer.innerHTML = renderMarkdown((geminiResult as any).value.analysis || 'Analysis completed, but no specific solution was generated.');
      else geminiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${((geminiResult as any).reason?.message) || ((geminiResult as any).value?.error) || 'Failed to analyze screenshots'}`);
    }

    if (isHighlightJsLoaded()) { try { document.querySelectorAll('pre code').forEach((block) => (window as any).hljs.highlightElement(block as any)); } catch (e) { console.error('HLJS error:', e); } }
  } catch (e: any) {
    openaiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${e.message}`);
    geminiResponseContainer.innerHTML = renderMarkdown(`**Error:** ${e.message}`);
    showToast(`Error: ${e.message}`);
  }
});

// Response view toggles
showBothBtn.addEventListener('click', () => {
  responsesContainer.style.display = 'flex';
  (document.querySelector('#responsesContainer > div:nth-child(1)') as HTMLElement).style.display = 'flex';
  (document.querySelector('#responsesContainer > div:nth-child(2)') as HTMLElement).style.display = 'flex';
  (document.querySelector('#responsesContainer > div:nth-child(1)') as HTMLElement).style.flex = '1';
  (document.querySelector('#responsesContainer > div:nth-child(2)') as HTMLElement).style.flex = '1';
  showBothBtn.classList.add('btn-primary');
  showOpenAIBtn.classList.remove('btn-primary');
  showGeminiBtn.classList.remove('btn-primary');
  window.electronAPI.saveDefaultModel('both');
  defaultModelSelect.value = 'both';
});

showOpenAIBtn.addEventListener('click', () => {
  responsesContainer.style.display = 'flex';
  (document.querySelector('#responsesContainer > div:nth-child(1)') as HTMLElement).style.display = 'flex';
  (document.querySelector('#responsesContainer > div:nth-child(1)') as HTMLElement).style.flex = '1';
  (document.querySelector('#responsesContainer > div:nth-child(2)') as HTMLElement).style.display = 'none';
  showBothBtn.classList.remove('btn-primary');
  showOpenAIBtn.classList.add('btn-primary');
  showGeminiBtn.classList.remove('btn-primary');
  window.electronAPI.saveDefaultModel('openai');
  defaultModelSelect.value = 'openai';
});

showGeminiBtn.addEventListener('click', () => {
  responsesContainer.style.display = 'flex';
  (document.querySelector('#responsesContainer > div:nth-child(1)') as HTMLElement).style.display = 'none';
  (document.querySelector('#responsesContainer > div:nth-child(2)') as HTMLElement).style.display = 'flex';
  (document.querySelector('#responsesContainer > div:nth-child(2)') as HTMLElement).style.flex = '1';
  showBothBtn.classList.remove('btn-primary');
  showOpenAIBtn.classList.remove('btn-primary');
  showGeminiBtn.classList.add('btn-primary');
  window.electronAPI.saveDefaultModel('gemini');
  defaultModelSelect.value = 'gemini';
});

defaultModelSelect.addEventListener('change', () => {
  const defaultModel = defaultModelSelect.value;
  if (defaultModel === 'both') showBothBtn.click(); else if (defaultModel === 'openai') showOpenAIBtn.click(); else if (defaultModel === 'gemini') showGeminiBtn.click();
});

answerStyleSelect.addEventListener('change', () => {
  const answerStyle = answerStyleSelect.value as any;
  window.electronAPI.savePreferences({ preferredLanguage: preferredLanguageSelect.value, answerStyle });
  showToast(`Answer style changed to: ${answerStyle}`);
});

openaiModelSelect.addEventListener('change', () => {
  const openaiModel = openaiModelSelect.value;
  window.electronAPI.saveOpenAIModel(openaiModel);
  showToast(`OpenAI model changed to: ${openaiModel}`);
});

// API keys and preferences
saveApiKeyBtn.addEventListener('click', () => {
  const apiKey = apiKeyInput.value.trim();
  const geminiApiKey = geminiApiKeyInput.value.trim();
  if (!apiKey && !geminiApiKey) { showToast('Please enter at least one API key'); return; }
  if (apiKey) { window.electronAPI.saveApiKey(apiKey); window.electronAPI.saveOpenAIApiKey(apiKey); showToast('OpenAI API key saved'); }
  if (geminiApiKey) { window.electronAPI.saveGeminiApiKey(geminiApiKey); showToast('Gemini API key saved'); }
});

savePreferencesBtn.addEventListener('click', () => {
  const language = preferredLanguageSelect.value;
  const defaultModel = defaultModelSelect.value as any;
  const answerStyle = answerStyleSelect.value as any;
  const openaiModel = openaiModelSelect.value;
  window.electronAPI.savePreferences({ preferredLanguage: language, answerStyle });
  window.electronAPI.saveDefaultModel(defaultModel);
  window.electronAPI.saveOpenAIModel(openaiModel);
  showToast('Preferences saved');
});

function loadSettings() {
  window.electronAPI.getOpenAIApiKey().then((apiKey) => { if (apiKey) apiKeyInput.value = apiKey; });
  window.electronAPI.getGeminiApiKey().then((geminiApiKey) => { if (geminiApiKey) geminiApiKeyInput.value = geminiApiKey; });
  window.electronAPI.getPreferences().then((preferences) => {
    if (preferences && (preferences as any).preferredLanguage) preferredLanguageSelect.value = (preferences as any).preferredLanguage;
    if (preferences && (preferences as any).answerStyle) answerStyleSelect.value = (preferences as any).answerStyle;
  });
  window.electronAPI.getOpenAIModel().then((openaiModel) => { if (openaiModel) openaiModelSelect.value = openaiModel; });
  window.electronAPI.getDefaultModel().then((defaultModel) => {
    if (defaultModel) {
      defaultModelSelect.value = defaultModel;
      if (defaultModel === 'both') showBothBtn.click(); else if (defaultModel === 'openai') showOpenAIBtn.click(); else if (defaultModel === 'gemini') showGeminiBtn.click();
    }
  });
}

async function updateScreenshotList() {
  const screenshots = await window.electronAPI.getScreenshots();
  if (screenshots.length === 0) {
    screenshotList.innerHTML = `
      <div class="screenshot-item empty">
        <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: rgba(255,255,255,0.5);">No screenshots</div>
      </div>`;
    return;
  }
  screenshotList.innerHTML = screenshots.map((p, i) => `
    <div class="screenshot-item" data-path="${p}">
      <img src="${p}" alt="Screenshot ${i + 1}" />
      <div class="remove" data-index="${i}">×</div>
    </div>`).join('');
  document.querySelectorAll('.screenshot-item .remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt((btn as HTMLElement).getAttribute('data-index')!);
      window.electronAPI.removeScreenshot(idx);
      updateScreenshotList();
    });
  });
}

function showToast(message: string, duration = 1000) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

// Event listeners from main process
const unsubscribeScreenshotTaken = window.electronAPI.onScreenshotTaken(handleScreenshotTaken);
const unsubscribeProcessScreenshots = window.electronAPI.onProcessScreenshots(handleProcessScreenshots);
const unsubscribeScreenshotsCleared = window.electronAPI.onScreenshotsCleared(handleScreenshotsCleared);
const unsubscribeAnswerStyleChanged = window.electronAPI.onAnswerStyleChanged(handleAnswerStyleChanged);
const unsubscribeModelChanged = window.electronAPI.onModelChanged(handleModelChanged);
const unsubscribeOpenAIModelChanged = window.electronAPI.onOpenAIModelChanged(handleOpenAIModelChanged);
const unsubscribeSwitchTab = window.electronAPI.onSwitchTab(handleSwitchTab);
const unsubscribeResponseCopied = window.electronAPI.onResponseCopied(handleResponseCopied);
const unsubscribeProcessClipboardPrompt = window.electronAPI.onProcessClipboardPrompt(handleProcessClipboardPrompt);
const unsubscribeTriggerRegionScreenshot = window.electronAPI.onTriggerRegionScreenshot(handleTriggerRegionScreenshot);
const unsubscribeExtractTextFromScreenshots = window.electronAPI.onExtractTextFromScreenshots(handleExtractTextFromScreenshots);

function handleScreenshotTaken() { showToast('Screenshot taken!'); updateScreenshotList(); }
function handleProcessScreenshots() { processScreenshotsBtn.click(); showToast('Processing screenshots with both models...'); }
function handleScreenshotsCleared() { showToast('Screenshots cleared!'); updateScreenshotList(); }
function handleAnswerStyleChanged(style: string) { showToast(`Answer style changed to: ${style}`); if (answerStyleSelect) answerStyleSelect.value = style; }
function handleSwitchTab(direction: string) {
  const currentTab = document.querySelector('.tab.active') as HTMLElement;
  const allTabs = Array.from(document.querySelectorAll('.tab')) as HTMLElement[];
  const currentIndex = allTabs.indexOf(currentTab);
  let nextIndex = direction === 'previous' ? (currentIndex - 1 + allTabs.length) % allTabs.length : (currentIndex + 1) % allTabs.length;
  allTabs[nextIndex].click();
  showToast(`Switched to ${allTabs[nextIndex].textContent} tab`);
}
function handleModelChanged(model: any) {
  defaultModelSelect.value = model;
  if (model === 'both') { showBothBtn.click(); showToast('Switched to both AI models'); }
  else if (model === 'openai') { showOpenAIBtn.click(); showToast('Switched to OpenAI only'); }
  else if (model === 'gemini') { showGeminiBtn.click(); showToast('Switched to Gemini only'); }
}
function handleOpenAIModelChanged(model: string) { openaiModelSelect.value = model; showToast(`OpenAI model changed to: ${model}`); }
function handleResponseCopied() { showToast('Response copied to clipboard!'); }
function handleProcessClipboardPrompt() { switchTab('prompt'); clipboardPromptBtn.click(); showToast('Processing clipboard text...'); }
function handleTriggerRegionScreenshot() { window.electronAPI.takeRegionScreenshot().then((r) => { if ((r as any).success) updateScreenshotList(); }).catch(() => {}); }
function handleExtractTextFromScreenshots() { window.electronAPI.extractTextFromScreenshots().then((r) => { if ((r as any).success) userInput.value = (r as any).extractedText.substring(0, 100) + '...'; else showToast(`Error: ${(r as any).error}`); }).catch((e) => showToast(`Error: ${e.message}`)); }

// Initialize
(document.addEventListener('DOMContentLoaded', () => { loadSettings(); updateScreenshotList(); (tabs[0] as HTMLElement).click(); }))

// ============ Documents panel (Settings) ============
document.addEventListener('DOMContentLoaded', () => {
  const settingsEl = document.querySelector('[data-tab-content="settings"]') as HTMLElement | null;
  if (!settingsEl) return;

  // Build panel structure
  const panel = document.createElement('div');
  panel.className = 'settings-group';
  panel.innerHTML = `
    <h3>Documents</h3>
    <div style="display:flex; gap:8px; margin-bottom:8px;">
      <button id="docImportBtn" class="btn btn-primary">Import document…</button>
      <button id="docClearBtn" class="btn">Clear active</button>
    </div>
    <div id="docStatus" style="font-size: 12px; opacity: 0.8; margin-bottom:8px;"></div>
    <div id="docList" class="screenshot-list"></div>
  `;
  settingsEl.prepend(panel);

  const docImportBtn = document.getElementById('docImportBtn') as HTMLButtonElement;
  const docClearBtn = document.getElementById('docClearBtn') as HTMLButtonElement;
  const docStatus = document.getElementById('docStatus') as HTMLElement;
  const docList = document.getElementById('docList') as HTMLElement;

  async function refreshDocStatus() {
    try {
      const info = await (window as any).electronAPI.getActiveDocInfo();
      if (info.hasContext) {
        docStatus.textContent = `Active: ${info.fileName || 'document'} (${info.length} chars)`;
      } else {
        docStatus.textContent = 'No active document';
      }
    } catch (e) {
      docStatus.textContent = '';
    }
  }

  async function refreshDocList() {
    try {
      const res = await (window as any).electronAPI.listDocs();
      if (!res.success) { docList.innerHTML = '<div style="opacity:.7">Failed to load documents</div>'; return; }
      const docs = res.docs as Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean }>;
      if (!docs.length) {
        docList.innerHTML = '<div style="opacity:.7">No documents imported yet</div>';
        return;
      }
      docList.innerHTML = docs.map(d => `
        <div class="screenshot-item" data-path="${d.filePath}" style="height:auto; padding:8px; display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div class="highlighted-text">${d.fileName}${d.active ? ' • (active)' : ''}</div>
            <div style="font-size:12px; opacity:.8">${d.length} chars · ${new Date(d.addedAt).toLocaleString()}</div>
          </div>
          <div style="display:flex; gap:6px;">
            <button class="btn" data-action="set" data-path="${d.filePath}">${d.active ? 'Active' : 'Set active'}</button>
            <button class="btn btn-danger" data-action="remove" data-path="${d.filePath}">Remove</button>
          </div>
        </div>
      `).join('');

      // Wire actions
      docList.querySelectorAll('button[data-action="set"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const fp = (btn as HTMLElement).getAttribute('data-path')!;
          await (window as any).electronAPI.setActiveDoc(fp);
          await refreshDocStatus();
          await refreshDocList();
          showToast('Active document updated');
        });
      });
      docList.querySelectorAll('button[data-action="remove"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const fp = (btn as HTMLElement).getAttribute('data-path')!;
          await (window as any).electronAPI.removeDoc(fp);
          await refreshDocStatus();
          await refreshDocList();
          showToast('Document removed');
        });
      });
    } catch (e) {
      docList.innerHTML = '<div style="opacity:.7">Failed to load documents</div>';
    }
  }

  docImportBtn.addEventListener('click', async () => {
    try {
      const picked = await (window as any).electronAPI.openFileDialog();
      if (picked.canceled || !picked.filePath) return;
      // Ask about file (sets context automatically on main)
      await (window as any).electronAPI.askAboutFileWithOpenAI(picked.filePath, '');
      await refreshDocStatus();
      await refreshDocList();
      showToast('Document imported');
    } catch (e: any) {
      showToast(`Error importing: ${e.message || e}`);
    }
  });

  docClearBtn.addEventListener('click', async () => {
    await (window as any).electronAPI.clearActiveDocContext();
    await refreshDocStatus();
    await refreshDocList();
  });

  // Initial load
  refreshDocStatus();
  refreshDocList();
});
