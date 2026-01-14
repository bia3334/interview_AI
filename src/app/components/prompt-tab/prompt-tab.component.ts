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
    // Try to parse as JSON array first (new format)
    try {
      const providers = JSON.parse(model);
      if (Array.isArray(providers)) {
        this.openaiEnabled = providers.includes('openai');
        this.geminiEnabled = providers.includes('gemini');
        this.zaiEnabled = providers.includes('zai');
        this.lmstudioMode = false;
        return;
      }
    } catch {
      // Not JSON, use legacy format
    }
    
    // Legacy format compatibility
    switch (model) {
      case 'lmstudio':
        this.lmstudioMode = true;
        this.openaiEnabled = false;
        this.geminiEnabled = false;
        this.zaiEnabled = false;
        break;
      case 'both':
        this.lmstudioMode = false;
        this.openaiEnabled = true;
        this.geminiEnabled = true;
        this.zaiEnabled = false;
        break;
      case 'openai':
        this.lmstudioMode = false;
        this.openaiEnabled = true;
        this.geminiEnabled = false;
        this.zaiEnabled = false;
        break;
      case 'gemini':
        this.lmstudioMode = false;
        this.openaiEnabled = false;
        this.geminiEnabled = true;
        this.zaiEnabled = false;
        break;
      case 'zai':
        this.lmstudioMode = false;
        this.openaiEnabled = false;
        this.geminiEnabled = false;
        this.zaiEnabled = true;
        break;
      default:
        this.lmstudioMode = false;
        this.openaiEnabled = true;
        this.geminiEnabled = true;
        this.zaiEnabled = false;
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

  async sendPrompt() {
    const prompt = this.userInput.trim();
    if (!prompt) return;

    this.isLoading = true;
    this.openaiResponse = '';
    this.geminiResponse = '';
    this.lmstudioResponse = '';
    this.zaiResponse = '';

    let rawOpenaiResponse = '';
    let rawGeminiResponse = '';
    let rawLmstudioResponse = '';
    let rawZaiResponse = '';

    // Check if we have screenshots to include
    const hasScreenshots = this.screenshots.length > 0;

    // Add user message to conversation history if in conversation mode
    if (this.isConversationMode) {
      this.conversationHistory.push({ role: 'user', content: prompt });
    }

    try {
      if (this.openaiEnabled && !this.lmstudioMode) {
        this.openaiResponse = '<p>Loading...</p>';
        this.cdr.detectChanges();
        try {
          // Use conversation API if in conversation mode, otherwise use simple prompt
          // Use screenshot-aware API if screenshots are present
          if (this.isConversationMode) {
            rawOpenaiResponse = await this.electronService.sendConversationToOpenAI(this.conversationHistory);
          } else if (hasScreenshots) {
            rawOpenaiResponse = await this.electronService.sendPromptWithScreenshotsToOpenAI(prompt);
          } else {
            rawOpenaiResponse = await this.electronService.sendPromptToOpenAI(prompt);
          }
          this.ngZone.run(() => {
            this.openaiResponse = this.markdownService.renderMarkdown(rawOpenaiResponse);
            this.cdr.detectChanges();
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            this.openaiResponse = this.markdownService.renderMarkdown(`**Error:** ${error.message || 'Failed to get response'}`);
            this.cdr.detectChanges();
          });
        }
      }

      if (this.geminiEnabled && !this.lmstudioMode) {
        this.geminiResponse = '<p>Loading...</p>';
        this.cdr.detectChanges();
        try {
          // Use conversation API if in conversation mode, otherwise use simple prompt
          // Use screenshot-aware API if screenshots are present
          if (this.isConversationMode) {
            rawGeminiResponse = await this.electronService.sendConversationToGemini(this.conversationHistory);
          } else if (hasScreenshots) {
            rawGeminiResponse = await this.electronService.sendPromptWithScreenshotsToGemini(prompt);
          } else {
            rawGeminiResponse = await this.electronService.sendPromptToGemini(prompt);
          }
          this.ngZone.run(() => {
            this.geminiResponse = this.markdownService.renderMarkdown(rawGeminiResponse);
            this.cdr.detectChanges();
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            this.geminiResponse = this.markdownService.renderMarkdown(`**Error:** ${error.message || 'Failed to get response'}`);
            this.cdr.detectChanges();
          });
        }
      }

      // LM Studio (local model)
      if (this.lmstudioMode) {
        this.lmstudioResponse = '<p>Loading...</p>';
        this.cdr.detectChanges();
        try {
          // Use conversation API if in conversation mode, otherwise use simple prompt
          // Note: LM Studio doesn't support screenshots (text-only)
          if (this.isConversationMode) {
            rawLmstudioResponse = await this.electronService.sendConversationToLMStudio(this.conversationHistory);
          } else {
            rawLmstudioResponse = await this.electronService.sendPromptToLMStudio(prompt);
          }
          this.ngZone.run(() => {
            this.lmstudioResponse = this.markdownService.renderMarkdown(rawLmstudioResponse);
            this.cdr.detectChanges();
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            this.lmstudioResponse = this.markdownService.renderMarkdown(`**Error:** ${error.message || 'Failed to get response from LM Studio'}`);
            this.cdr.detectChanges();
          });
        }
      }

      // Z.AI
      if (this.zaiEnabled && !this.lmstudioMode) {
        this.zaiResponse = '<p>Loading...</p>';
        this.cdr.detectChanges();
        try {
          // Use conversation API if in conversation mode, otherwise use simple prompt
          // Note: Z.AI doesn't support screenshots (text-only)
          if (this.isConversationMode) {
            rawZaiResponse = await this.electronService.sendConversationToZAI(this.conversationHistory);
          } else {
            rawZaiResponse = await this.electronService.sendPromptToZAI(prompt);
          }
          this.ngZone.run(() => {
            this.zaiResponse = this.markdownService.renderMarkdown(rawZaiResponse);
            this.cdr.detectChanges();
          });
        } catch (error: any) {
          this.ngZone.run(() => {
            this.zaiResponse = this.markdownService.renderMarkdown(`**Error:** ${error.message || 'Failed to get response from Z.AI'}`);
            this.cdr.detectChanges();
          });
        }
      }

      // Add assistant response to conversation history if in conversation mode
      if (this.isConversationMode && (rawOpenaiResponse || rawGeminiResponse || rawLmstudioResponse || rawZaiResponse)) {
        // Use the appropriate response as the assistant response
        const assistantResponse = rawOpenaiResponse || rawGeminiResponse || rawLmstudioResponse || rawZaiResponse;
        this.conversationHistory.push({ role: 'assistant', content: assistantResponse });
      }

      // Save or update history
      if (rawOpenaiResponse || rawGeminiResponse || rawLmstudioResponse || rawZaiResponse) {
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
            prompt: prompt,
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
        this.userInput = ''; // Clear input after sending
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

    try {
      this.isLoading = true;
      this.openaiResponse = '<p>Analyzing screenshots...</p>';
      this.geminiResponse = '<p>Analyzing screenshots...</p>';
      this.zaiResponse = '<p>Analyzing screenshots...</p>';
      this.cdr.detectChanges();

      const preferences = await this.electronService.getPreferences();
      const language = preferences.preferredLanguage || 'python';

      let savedOpenaiResponse = '';
      let savedGeminiResponse = '';
      let savedZaiResponse = '';

      if (this.openaiEnabled && !this.lmstudioMode) {
        try {
          const result = await this.electronService.analyzeScreenshotsWithOpenAI({ language });
          if (result.success && result.analysis) {
            savedOpenaiResponse = this.markdownService.renderMarkdown(result.analysis);
          } else {
            savedOpenaiResponse = this.markdownService.renderMarkdown(`**Error:** ${result.error || 'Failed to analyze screenshots'}`);
          }
          this.ngZone.run(() => {
            this.openaiResponse = savedOpenaiResponse;
            this.cdr.detectChanges();
          });
        } catch (error: any) {
          savedOpenaiResponse = this.markdownService.renderMarkdown(`**Error:** ${error.message || 'Failed to analyze with OpenAI'}`);
          this.ngZone.run(() => {
            this.openaiResponse = savedOpenaiResponse;
            this.cdr.detectChanges();
          });
        }
      }

      if (this.geminiEnabled && !this.lmstudioMode) {
        try {
          const result = await this.electronService.analyzeScreenshotsWithGemini({ language });
          if (result.success && result.analysis) {
            savedGeminiResponse = this.markdownService.renderMarkdown(result.analysis);
          } else {
            savedGeminiResponse = this.markdownService.renderMarkdown(`**Error:** ${result.error || 'Failed to analyze screenshots'}`);
          }
          this.ngZone.run(() => {
            this.geminiResponse = savedGeminiResponse;
            this.cdr.detectChanges();
          });
        } catch (error: any) {
          savedGeminiResponse = this.markdownService.renderMarkdown(`**Error:** ${error.message || 'Failed to analyze with Gemini'}`);
          this.ngZone.run(() => {
            this.geminiResponse = savedGeminiResponse;
            this.cdr.detectChanges();
          });
        }
      }

      // Note: Z.AI doesn't support screenshot analysis directly (text-only)
      // But we can include it if we implement OCR first
      if (this.zaiEnabled && !this.lmstudioMode) {
        // Z.AI is text-only, skip screenshot analysis
        this.zaiResponse = '';
      }

      // Save to history using the locally tracked responses
      if (savedOpenaiResponse || savedGeminiResponse || savedZaiResponse) {
        this.electronService.saveHistoryItem({
          id: Date.now().toString(),
          timestamp: new Date(),
          prompt: `Screenshot analysis (${screenshotCount} image${screenshotCount > 1 ? 's' : ''})`,
          screenshotCount: screenshotCount,
          openaiResponse: savedOpenaiResponse,
          geminiResponse: savedGeminiResponse,
          lmstudioResponse: '',
          zaiResponse: savedZaiResponse
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

