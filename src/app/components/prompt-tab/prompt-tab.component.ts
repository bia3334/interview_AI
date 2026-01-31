import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, NgZone, ChangeDetectorRef, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { ElectronService, HistoryItem } from '../../services/electron.service';
import { MarkdownService } from '../../services/markdown.service';
import { DEFAULTS, AIProvider } from '../../constants/settings';

@Component({
  selector: 'app-prompt-tab',
  templateUrl: './prompt-tab.component.html',
  styleUrls: ['./prompt-tab.component.css'],
  standalone: false
})
export class PromptTabComponent implements OnInit, AfterViewChecked, OnChanges {
  userInput: string = '';
  openaiResponse: string = '';
  geminiResponse: string = '';
  lmstudioResponse: string = '';
  zaiResponse: string = '';
  defaultModel: AIProvider = DEFAULTS.MODEL;
  showBoth: boolean = true;
  isLoading: boolean = false;
  screenshots: string[] = [];
  
  // Flexible provider selection
  openaiEnabled: boolean = true;
  geminiEnabled: boolean = true;
  zaiEnabled: boolean = false;
  lmstudioMode: boolean = false;

  // Document context
  documents: Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean; hasKeyInfo?: boolean }> = [];
  showDocumentSelector: boolean = false;

  // Notes context
  notes: Array<{ id: string; title: string; contentPreview: string; length: number; createdAt: number; updatedAt: number; active: boolean }> = [];
  showNotesSection: boolean = false;
  showNoteEditor: boolean = false;
  currentNoteId: string | null = null;
  noteTitle: string = '';
  noteContent: string = '';
  isEditingNote: boolean = false;

  // Conversation history for context
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  isConversationMode: boolean = false;
  currentHistoryItemId: string | null = null;

  @Input() continuedItem: HistoryItem | null = null;
  @Output() itemLoaded = new EventEmitter<void>();

  @ViewChild('openaiResponseContainer') openaiResponseContainer!: ElementRef;
  @ViewChild('geminiResponseContainer') geminiResponseContainer!: ElementRef;
  @ViewChild('lmstudioResponseContainer') lmstudioResponseContainer!: ElementRef;
  @ViewChild('zaiResponseContainer') zaiResponseContainer!: ElementRef;

  constructor(
    private electronService: ElectronService,
    private markdownService: MarkdownService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadSettings();
    this.loadScreenshots();
    this.loadDocuments();
    this.loadNotes();
    this.setupEventListeners();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['continuedItem'] && this.continuedItem) {
      this.loadContinuedItem(this.continuedItem);
    }
  }

  loadContinuedItem(item: HistoryItem) {
    // Clear input but show the previous conversation
    this.userInput = '';
    this.openaiResponse = item.openaiResponse || '';
    this.geminiResponse = item.geminiResponse || '';
    this.lmstudioResponse = item.lmstudioResponse || '';
    this.zaiResponse = (item as any).zaiResponse || '';
    
    // Store the history item ID for updating later
    this.currentHistoryItemId = item.id;
    
    // Build conversation history from the continued item
    this.conversationHistory = [];
    if (item.prompt) {
      this.conversationHistory.push({ role: 'user', content: item.prompt });
    }
    // Use the raw response text (strip HTML for context)
    if (item.openaiResponse) {
      const textContent = this.stripHtml(item.openaiResponse);
      this.conversationHistory.push({ role: 'assistant', content: textContent });
    }
    
    this.isConversationMode = true;
    this.cdr.detectChanges();
    this.itemLoaded.emit();
  }

  stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  clearConversation() {
    this.conversationHistory = [];
    this.isConversationMode = false;
    this.currentHistoryItemId = null;
    this.openaiResponse = '';
    this.geminiResponse = '';
    this.lmstudioResponse = '';
    this.zaiResponse = '';
    this.userInput = '';
    this.cdr.detectChanges();
  }

  async loadScreenshots() {
    const screenshots = await this.electronService.getScreenshots();
    this.ngZone.run(() => {
      this.screenshots = screenshots;
      this.cdr.detectChanges();
    });
  }

  async loadDocuments() {
    const result = await this.electronService.listDocs();
    this.ngZone.run(() => {
      if (result.success) {
        this.documents = result.docs;
      }
      this.cdr.detectChanges();
    });
  }

  toggleDocumentSelector() {
    this.showDocumentSelector = !this.showDocumentSelector;
  }

  async setActiveDocument(filePath: string) {
    await this.electronService.setActiveDoc(filePath);
    await this.loadDocuments();
  }

  async clearActiveDocument() {
    await this.electronService.clearActiveDocContext();
    await this.loadDocuments();
  }

  getActiveDocument() {
    return this.documents.find(d => d.active);
  }

  // =====================
  // Notes Methods
  // =====================

  async loadNotes() {
    const result = await this.electronService.listNotes();
    this.ngZone.run(() => {
      if (result.success) {
        this.notes = result.notes;
      }
      this.cdr.detectChanges();
    });
  }

  toggleNotesSection() {
    this.showNotesSection = !this.showNotesSection;
    if (!this.showNotesSection) {
      this.closeNoteEditor();
    }
  }

  getActiveNote() {
    return this.notes.find(n => n.active);
  }

  openNewNoteEditor() {
    this.isEditingNote = false;
    this.currentNoteId = null;
    this.noteTitle = '';
    this.noteContent = '';
    this.showNoteEditor = true;
  }

  async openEditNoteEditor(noteId: string) {
    const result = await this.electronService.getNote(noteId);
    if (result.success && result.note) {
      this.isEditingNote = true;
      this.currentNoteId = noteId;
      this.noteTitle = result.note.title;
      this.noteContent = result.note.content;
      this.showNoteEditor = true;
      this.cdr.detectChanges();
    }
  }

  closeNoteEditor() {
    this.showNoteEditor = false;
    this.currentNoteId = null;
    this.noteTitle = '';
    this.noteContent = '';
    this.isEditingNote = false;
  }

  async saveNote() {
    if (!this.noteContent.trim()) {
      return;
    }

    if (this.isEditingNote && this.currentNoteId) {
      // Update existing note
      await this.electronService.updateNote(this.currentNoteId, {
        title: this.noteTitle,
        content: this.noteContent
      });
    } else {
      // Create new note
      await this.electronService.createNote(this.noteTitle, this.noteContent);
    }

    this.closeNoteEditor();
    await this.loadNotes();
  }

  async deleteNote(noteId: string) {
    await this.electronService.deleteNote(noteId);
    await this.loadNotes();
  }

  async setActiveNote(noteId: string) {
    await this.electronService.setActiveNote(noteId);
    await this.loadNotes();
  }

  async clearActiveNote() {
    await this.electronService.setActiveNote(null);
    await this.loadNotes();
  }

  async clearScreenshots() {
    // Remove all screenshots one by one from end to start
    for (let i = this.screenshots.length - 1; i >= 0; i--) {
      await this.electronService.removeScreenshot(i);
    }
    this.ngZone.run(() => {
      this.screenshots = [];
      this.cdr.detectChanges();
    });
  }

  ngAfterViewChecked() {
    // Apply syntax highlighting and math rendering after view updates
    this.markdownService.highlightCodeBlocks();
    
    // Render math in response containers using KaTeX auto-render
    if (this.openaiResponseContainer?.nativeElement) {
      this.markdownService.renderMathInElement(this.openaiResponseContainer.nativeElement);
    }
    if (this.geminiResponseContainer?.nativeElement) {
      this.markdownService.renderMathInElement(this.geminiResponseContainer.nativeElement);
    }
    if (this.lmstudioResponseContainer?.nativeElement) {
      this.markdownService.renderMathInElement(this.lmstudioResponseContainer.nativeElement);
    }
    if (this.zaiResponseContainer?.nativeElement) {
      this.markdownService.renderMathInElement(this.zaiResponseContainer.nativeElement);
    }
  }

  async loadSettings() {
    const model = await this.electronService.getDefaultModel();
    this.defaultModel = model;
    this.parseEnabledProviders(model);
    this.updateViewMode();
  }

  // Parse the defaultModel setting into individual enabled states
  parseEnabledProviders(model: string) {
    let providers: string[] = [];

    // 1. Try to parse as JSON array
    try {
      const parsed = JSON.parse(model);
      if (Array.isArray(parsed)) providers = parsed;
    } catch {
      // Ignore error, providers remains empty
    }

    // 2. If not JSON, map legacy aliases to arrays
    if (providers.length === 0) {
      const legacyAliases: Record<string, string[]> = {
        'lmstudio': ['lmstudio'],
        'both':     ['openai', 'gemini'],
        'openai':   ['openai'],
        'gemini':   ['gemini'],
        'zai':      ['zai']
      };
      // Default fallback (equivalent to your 'default' case)
      providers = legacyAliases[model] || ['openai', 'gemini'];
    }

    // 3. Apply State (Single source of truth)
    // Check for 'lmstudio' first as it acts as an exclusive mode in your logic
    this.lmstudioMode = providers.includes('lmstudio');

    if (this.lmstudioMode) {
      // If local mode is on, disable cloud providers
      this.openaiEnabled = false;
      this.geminiEnabled = false;
      this.zaiEnabled = false;
    } else {
      // Otherwise, check inclusion for each cloud provider
      this.openaiEnabled = providers.includes('openai');
      this.geminiEnabled = providers.includes('gemini');
      this.zaiEnabled = providers.includes('zai');
    }
  }

  setupEventListeners() {
    // Process screenshots (Ctrl+Shift+P)
    this.electronService.onProcessScreenshots().subscribe(() => {
      this.processScreenshots();
    });

    // Process clipboard prompt
    this.electronService.onProcessClipboardPrompt().subscribe(() => {
      this.processClipboardPrompt();
    });

    // Model changed
    this.electronService.onModelChanged().subscribe((model) => {
      this.ngZone.run(() => {
        this.defaultModel = model;
        this.parseEnabledProviders(model);
        this.updateViewMode();
        this.cdr.detectChanges();
      });
    });

    // Trigger region screenshot
    this.electronService.onTriggerRegionScreenshot().subscribe(() => {
      this.takeRegionScreenshot();
    });

    // Extract text from screenshots
    this.electronService.onExtractTextFromScreenshots().subscribe(() => {
      this.extractText();
    });

    // Screenshot taken - reload screenshots
    this.electronService.onScreenshotTaken().subscribe(() => {
      this.loadScreenshots();
    });

    // Screenshots cleared
    this.electronService.onScreenshotsCleared().subscribe(() => {
      this.loadScreenshots();
    });

    // Window shown - reload screenshots in case any were taken while hidden
    this.electronService.onWindowShown().subscribe(() => {
      this.loadScreenshots();
    });

    // Documents updated - reload document list
    this.electronService.onDocumentsUpdated().subscribe(() => {
      this.loadDocuments();
    });

    // Notes updated - reload notes list
    this.electronService.onNotesUpdated().subscribe(() => {
      this.loadNotes();
    });
  }

  updateViewMode() {
    // For legacy compatibility
    this.showBoth = this.openaiEnabled && this.geminiEnabled;
    
    // Clear responses from providers not being used when switching
    if (!this.openaiEnabled) {
      this.openaiResponse = '';
    }
    if (!this.geminiEnabled) {
      this.geminiResponse = '';
    }
    if (!this.zaiEnabled) {
      this.zaiResponse = '';
    }
    if (!this.lmstudioMode) {
      this.lmstudioResponse = '';
    }
  }

  getActiveProvidersLabel(): string {
    const providers: string[] = [];
    if (this.openaiEnabled) providers.push('OpenAI');
    if (this.geminiEnabled) providers.push('Gemini');
    if (this.zaiEnabled) providers.push('Z.AI');
    return providers.length > 0 ? providers.join(' + ') : 'No provider';
  }

  // =====================
  // Generic Provider Request Handler
  // =====================

  /**
   * Generic handler for any AI provider request.
   * Handles try/catch, markdown rendering, and UI updates in a unified way.
   * @param apiCall - The async function that returns the raw string response.
   * @param updateFn - The callback to update the specific UI property.
   * @returns Promise<string> - The raw response (or empty string on error) for history tracking.
   */
  private async handleProviderRequest(
    apiCall: () => Promise<string>,
    updateFn: (formattedHtml: string) => void
  ): Promise<string> {
    try {
      const raw = await apiCall();
      const formatted = this.markdownService.renderMarkdown(raw);
      this.ngZone.run(() => {
        updateFn(formatted);
        this.cdr.detectChanges();
      });
      return raw; // Return raw text for history/conversation
    } catch (err: any) {
      const errorMsg = `**Error:** ${err.message || 'Request failed'}`;
      const formattedError = this.markdownService.renderMarkdown(errorMsg);
      this.ngZone.run(() => {
        updateFn(formattedError);
        this.cdr.detectChanges();
      });
      return ''; // Return empty so history ignores errors
    }
  }

  /**
   * Handler for screenshot analysis requests (returns { success, analysis, error }).
   */
  private async handleScreenshotAnalysis(
    apiCall: () => Promise<{ success: boolean; analysis?: string; error?: string }>,
    updateFn: (formattedHtml: string) => void
  ): Promise<string> {
    try {
      const result = await apiCall();
      let formatted: string;
      if (result.success && result.analysis) {
        formatted = this.markdownService.renderMarkdown(result.analysis);
      } else {
        formatted = this.markdownService.renderMarkdown(`**Error:** ${result.error || 'Failed to analyze screenshots'}`);
      }
      this.ngZone.run(() => {
        updateFn(formatted);
        this.cdr.detectChanges();
      });
      return result.success && result.analysis ? result.analysis : '';
    } catch (err: any) {
      const errorMsg = `**Error:** ${err.message || 'Analysis failed'}`;
      const formattedError = this.markdownService.renderMarkdown(errorMsg);
      this.ngZone.run(() => {
        updateFn(formattedError);
        this.cdr.detectChanges();
      });
      return '';
    }
  }

  async sendPrompt() {
    const prompt = this.userInput.trim();
    if (!prompt) return;

    // Immediately clear input and set loading state
    const savedPrompt = prompt;
    this.userInput = '';
    this.isLoading = true;

    // Check if we have screenshots to include
    const hasScreenshots = this.screenshots.length > 0;

    // Add user message to conversation history if in conversation mode
    if (this.isConversationMode) {
      this.conversationHistory.push({ role: 'user', content: savedPrompt });
    }

    // Set loading indicators for all active providers
    if (this.openaiEnabled && !this.lmstudioMode) {
      this.openaiResponse = '<p>Loading...</p>';
    }
    if (this.geminiEnabled && !this.lmstudioMode) {
      this.geminiResponse = '<p>Loading...</p>';
    }
    if (this.zaiEnabled && !this.lmstudioMode) {
      this.zaiResponse = '<p>Loading...</p>';
    }
    if (this.lmstudioMode) {
      this.lmstudioResponse = '<p>Loading...</p>';
    }
    this.cdr.detectChanges();

    // Build array of parallel tasks
    interface ProviderTask {
      name: 'openai' | 'gemini' | 'zai' | 'lmstudio';
      promise: Promise<string>;
    }
    const tasks: ProviderTask[] = [];

    // OpenAI
    if (this.openaiEnabled && !this.lmstudioMode) {
      const apiCall = () => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToOpenAI(this.conversationHistory);
        } else if (hasScreenshots) {
          return this.electronService.sendPromptWithScreenshotsToOpenAI(savedPrompt);
        } else {
          return this.electronService.sendPromptToOpenAI(savedPrompt);
        }
      };
      tasks.push({
        name: 'openai',
        promise: this.handleProviderRequest(apiCall, (html) => this.openaiResponse = html)
      });
    }

    // Gemini
    if (this.geminiEnabled && !this.lmstudioMode) {
      const apiCall = () => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToGemini(this.conversationHistory);
        } else if (hasScreenshots) {
          return this.electronService.sendPromptWithScreenshotsToGemini(savedPrompt);
        } else {
          return this.electronService.sendPromptToGemini(savedPrompt);
        }
      };
      tasks.push({
        name: 'gemini',
        promise: this.handleProviderRequest(apiCall, (html) => this.geminiResponse = html)
      });
    }

    // Z.AI (now supports screenshots via vision model)
    if (this.zaiEnabled && !this.lmstudioMode) {
      const apiCall = () => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToZAI(this.conversationHistory);
        } else if (hasScreenshots) {
          return this.electronService.sendPromptWithScreenshotsToZAI(savedPrompt);
        } else {
          return this.electronService.sendPromptToZAI(savedPrompt);
        }
      };
      tasks.push({
        name: 'zai',
        promise: this.handleProviderRequest(apiCall, (html) => this.zaiResponse = html)
      });
    }

    // LM Studio (local, text-only)
    if (this.lmstudioMode) {
      const apiCall = () => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToLMStudio(this.conversationHistory);
        } else {
          return this.electronService.sendPromptToLMStudio(savedPrompt);
        }
      };
      tasks.push({
        name: 'lmstudio',
        promise: this.handleProviderRequest(apiCall, (html) => this.lmstudioResponse = html)
      });
    }

    try {
      // Execute all provider requests in parallel
      const results = await Promise.all(tasks.map(t => t.promise));

      // Map results back to provider names
      const responseMap: Record<string, string> = {};
      tasks.forEach((task, index) => {
        responseMap[task.name] = results[index];
      });

      const rawOpenai = responseMap['openai'] || '';
      const rawGemini = responseMap['gemini'] || '';
      const rawZai = responseMap['zai'] || '';
      const rawLmstudio = responseMap['lmstudio'] || '';

      // Add assistant response to conversation history if in conversation mode
      if (this.isConversationMode) {
        const assistantResponse = rawOpenai || rawGemini || rawLmstudio || rawZai;
        if (assistantResponse) {
          this.conversationHistory.push({ role: 'assistant', content: assistantResponse });
        }
      }

      // Save or update history
      const hasAnyResponse = rawOpenai || rawGemini || rawLmstudio || rawZai;
      if (hasAnyResponse) {
        if (this.isConversationMode && this.currentHistoryItemId) {
          // Update existing history item with the full conversation
          const allPrompts = this.conversationHistory
            .filter(m => m.role === 'user')
            .map(m => m.content)
            .join('\n---\n');
          this.electronService.updateHistoryItem({
            id: this.currentHistoryItemId,
            timestamp: new Date(),
            prompt: allPrompts,
            screenshotCount: hasScreenshots ? this.screenshots.length : 0,
            openaiResponse: this.openaiResponse,
            geminiResponse: this.geminiResponse,
            lmstudioResponse: this.lmstudioResponse,
            zaiResponse: this.zaiResponse
          } as any);
        } else {
          // Create new history item
          this.electronService.saveHistoryItem({
            id: Date.now().toString(),
            timestamp: new Date(),
            prompt: savedPrompt,
            screenshotCount: hasScreenshots ? this.screenshots.length : 0,
            openaiResponse: this.openaiResponse,
            geminiResponse: this.geminiResponse,
            lmstudioResponse: this.lmstudioResponse,
            zaiResponse: this.zaiResponse
          } as any);
        }
      }
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async processClipboardPrompt() {
    try {
      this.isLoading = true;
      this.openaiResponse = '<p>Processing clipboard text...</p>';
      this.geminiResponse = '<p>Processing clipboard text...</p>';
      this.lmstudioResponse = '<p>Processing clipboard text...</p>';
      this.zaiResponse = '<p>Processing clipboard text...</p>';
      this.cdr.detectChanges();

      const result = await this.electronService.processClipboardPrompt();
      
      let savedOpenaiResponse = '';
      let savedGeminiResponse = '';
      let savedLmstudioResponse = '';
      let savedZaiResponse = '';
      let promptText = '';
      
      this.ngZone.run(() => {
        if (result.success) {
          promptText = result.prompt || '';
          this.userInput = promptText;
          
          if (result.openaiResponse) {
            savedOpenaiResponse = this.markdownService.renderMarkdown(result.openaiResponse);
            this.openaiResponse = savedOpenaiResponse;
          } else {
            this.openaiResponse = '<p>OpenAI model not selected or failed</p>';
          }
          
          if (result.geminiResponse) {
            savedGeminiResponse = this.markdownService.renderMarkdown(result.geminiResponse);
            this.geminiResponse = savedGeminiResponse;
          } else {
            this.geminiResponse = '<p>Gemini model not selected or failed</p>';
          }

          if (result.lmstudioResponse) {
            savedLmstudioResponse = this.markdownService.renderMarkdown(result.lmstudioResponse);
            this.lmstudioResponse = savedLmstudioResponse;
          } else {
            this.lmstudioResponse = '<p>LM Studio not selected or failed</p>';
          }

          if (result.zaiResponse) {
            savedZaiResponse = this.markdownService.renderMarkdown(result.zaiResponse);
            this.zaiResponse = savedZaiResponse;
          } else {
            this.zaiResponse = '<p>Z.AI not selected or failed</p>';
          }
        } else {
          const errorMsg = this.markdownService.renderMarkdown(`**Error:** ${result.error}`);
          this.openaiResponse = errorMsg;
          this.geminiResponse = errorMsg;
          this.lmstudioResponse = errorMsg;
          this.zaiResponse = errorMsg;
        }
        this.cdr.detectChanges();
      });

      // Save to history if we got responses
      if (savedOpenaiResponse || savedGeminiResponse || savedLmstudioResponse || savedZaiResponse) {
        this.electronService.saveHistoryItem({
          id: Date.now().toString(),
          timestamp: new Date(),
          prompt: promptText || 'Clipboard prompt',
          screenshotCount: 0,
          openaiResponse: savedOpenaiResponse,
          geminiResponse: savedGeminiResponse,
          lmstudioResponse: savedLmstudioResponse,
          zaiResponse: savedZaiResponse
        } as any);
      }
    } catch (error: any) {
      this.ngZone.run(() => {
        const errorMsg = this.markdownService.renderMarkdown(`**Error:** ${error.message}`);
        this.openaiResponse = errorMsg;
        this.geminiResponse = errorMsg;
        this.lmstudioResponse = errorMsg;
        this.zaiResponse = errorMsg;
        this.cdr.detectChanges();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async processScreenshots() {
    const screenshotCount = this.screenshots.length;
    if (screenshotCount === 0) {
      this.openaiResponse = this.markdownService.renderMarkdown('**No screenshots to analyze.** Take a screenshot first.');
      this.geminiResponse = this.markdownService.renderMarkdown('**No screenshots to analyze.** Take a screenshot first.');
      this.cdr.detectChanges();
      return;
    }

    this.isLoading = true;

    // Set loading indicators for all active providers
    if (this.openaiEnabled && !this.lmstudioMode) {
      this.openaiResponse = '<p>Analyzing screenshots...</p>';
    }
    if (this.geminiEnabled && !this.lmstudioMode) {
      this.geminiResponse = '<p>Analyzing screenshots...</p>';
    }
    if (this.zaiEnabled && !this.lmstudioMode) {
      this.zaiResponse = '<p>Analyzing screenshots...</p>';
    }
    if (this.lmstudioMode) {
      this.lmstudioResponse = '<p>LM Studio does not support image analysis</p>';
    }
    this.cdr.detectChanges();

    try {
      const preferences = await this.electronService.getPreferences();
      const language = preferences.preferredLanguage || 'python';

      // Build array of parallel tasks
      interface ProviderTask {
        name: 'openai' | 'gemini' | 'zai';
        promise: Promise<string>;
      }
      const tasks: ProviderTask[] = [];

      // OpenAI
      if (this.openaiEnabled && !this.lmstudioMode) {
        tasks.push({
          name: 'openai',
          promise: this.handleScreenshotAnalysis(
            () => this.electronService.analyzeScreenshotsWithOpenAI({ language }),
            (html) => this.openaiResponse = html
          )
        });
      }

      // Gemini
      if (this.geminiEnabled && !this.lmstudioMode) {
        tasks.push({
          name: 'gemini',
          promise: this.handleScreenshotAnalysis(
            () => this.electronService.analyzeScreenshotsWithGemini({ language }),
            (html) => this.geminiResponse = html
          )
        });
      }

      // Z.AI (supports vision via GLM-4.6V-Flash model)
      if (this.zaiEnabled && !this.lmstudioMode) {
        tasks.push({
          name: 'zai',
          promise: this.handleScreenshotAnalysis(
            () => this.electronService.analyzeScreenshotsWithZAI({ language }),
            (html) => this.zaiResponse = html
          )
        });
      }

      // Execute all provider requests in parallel
      const results = await Promise.all(tasks.map(t => t.promise));

      // Map results back to provider names
      const responseMap: Record<string, string> = {};
      tasks.forEach((task, index) => {
        responseMap[task.name] = results[index];
      });

      const rawOpenai = responseMap['openai'] || '';
      const rawGemini = responseMap['gemini'] || '';
      const rawZai = responseMap['zai'] || '';

      // Save to history if we got responses
      if (rawOpenai || rawGemini || rawZai) {
        this.electronService.saveHistoryItem({
          id: Date.now().toString(),
          timestamp: new Date(),
          prompt: `Screenshot analysis (${screenshotCount} image${screenshotCount > 1 ? 's' : ''})`,
          screenshotCount: screenshotCount,
          openaiResponse: this.openaiResponse,
          geminiResponse: this.geminiResponse,
          lmstudioResponse: '',
          zaiResponse: this.zaiResponse
        } as any);
      }
    } catch (error: any) {
      this.ngZone.run(() => {
        const errorMsg = this.markdownService.renderMarkdown(`**Error:** ${error.message}`);
        this.openaiResponse = errorMsg;
        this.geminiResponse = errorMsg;
        this.cdr.detectChanges();
      });
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async takeFullScreenshot() {
    try {
      const result = await this.electronService.takeScreenshot();
      if (result.success) {
        // Screenshot taken, will be updated via event listener
      }
    } catch (error: any) {
      console.error('Error taking screenshot:', error);
    }
  }

  async takeRegionScreenshot() {
    try {
      await this.electronService.takeRegionScreenshot();
    } catch (error: any) {
      console.error('Error taking region screenshot:', error);
    }
  }

  async extractText() {
    try {
      const result = await this.electronService.extractTextFromScreenshots();
      if (result.success && result.extractedText) {
        this.userInput = result.extractedText.substring(0, 100) + '...';
      }
    } catch (error: any) {
      console.error('Error extracting text:', error);
    }
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.sendPrompt();
    }
  }

  async removeScreenshot(index: number) {
    await this.electronService.removeScreenshot(index);
    await this.loadScreenshots();
  }

  async clearAllScreenshots() {
    // Remove all screenshots one by one from end to start
    for (let i = this.screenshots.length - 1; i >= 0; i--) {
      await this.electronService.removeScreenshot(i);
    }
    await this.loadScreenshots();
  }
}

