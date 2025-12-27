import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, NgZone, ChangeDetectorRef, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { ElectronService, HistoryItem } from '../../services/electron.service';
import { MarkdownService } from '../../services/markdown.service';

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
  defaultModel: 'openai' | 'gemini' | 'both' = 'both';
  showBoth: boolean = true;
  isLoading: boolean = false;
  screenshots: string[] = [];

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
  }

  async loadSettings() {
    this.defaultModel = await this.electronService.getDefaultModel();
    this.updateViewMode();
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
      this.defaultModel = model;
      this.updateViewMode();
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
    this.showBoth = this.defaultModel === 'both';
  }

  async sendPrompt() {
    const prompt = this.userInput.trim();
    if (!prompt) return;

    this.isLoading = true;
    this.openaiResponse = '';
    this.geminiResponse = '';

    let rawOpenaiResponse = '';
    let rawGeminiResponse = '';

    // Check if we have screenshots to include
    const hasScreenshots = this.screenshots.length > 0;

    // Add user message to conversation history if in conversation mode
    if (this.isConversationMode) {
      this.conversationHistory.push({ role: 'user', content: prompt });
    }

    try {
      if (this.defaultModel === 'both' || this.defaultModel === 'openai') {
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

      if (this.defaultModel === 'both' || this.defaultModel === 'gemini') {
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

      // Add assistant response to conversation history if in conversation mode
      if (this.isConversationMode && (rawOpenaiResponse || rawGeminiResponse)) {
        // Use OpenAI response as the assistant response (primary), or Gemini if OpenAI not available
        const assistantResponse = rawOpenaiResponse || rawGeminiResponse;
        this.conversationHistory.push({ role: 'assistant', content: assistantResponse });
      }

      // Save or update history
      if (rawOpenaiResponse || rawGeminiResponse) {
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
            geminiResponse: this.geminiResponse
          });
        } else {
          // Create new history item
          this.electronService.saveHistoryItem({
            id: Date.now().toString(),
            timestamp: new Date(),
            prompt: prompt,
            screenshotCount: hasScreenshots ? this.screenshots.length : 0,
            openaiResponse: this.openaiResponse,
            geminiResponse: this.geminiResponse
          });
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
      this.cdr.detectChanges();

      const result = await this.electronService.processClipboardPrompt();
      
      let savedOpenaiResponse = '';
      let savedGeminiResponse = '';
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
        } else {
          const errorMsg = this.markdownService.renderMarkdown(`**Error:** ${result.error}`);
          this.openaiResponse = errorMsg;
          this.geminiResponse = errorMsg;
        }
        this.cdr.detectChanges();
      });

      // Save to history if we got responses
      if (savedOpenaiResponse || savedGeminiResponse) {
        this.electronService.saveHistoryItem({
          id: Date.now().toString(),
          timestamp: new Date(),
          prompt: promptText || 'Clipboard prompt',
          screenshotCount: 0,
          openaiResponse: savedOpenaiResponse,
          geminiResponse: savedGeminiResponse
        });
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
      this.cdr.detectChanges();

      const preferences = await this.electronService.getPreferences();
      const language = preferences.preferredLanguage || 'python';

      let savedOpenaiResponse = '';
      let savedGeminiResponse = '';

      if (this.defaultModel === 'both' || this.defaultModel === 'openai') {
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

      if (this.defaultModel === 'both' || this.defaultModel === 'gemini') {
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

      // Save to history using the locally tracked responses
      if (savedOpenaiResponse || savedGeminiResponse) {
        this.electronService.saveHistoryItem({
          id: Date.now().toString(),
          timestamp: new Date(),
          prompt: `Screenshot analysis (${screenshotCount} image${screenshotCount > 1 ? 's' : ''})`,
          screenshotCount: screenshotCount,
          openaiResponse: savedOpenaiResponse,
          geminiResponse: savedGeminiResponse
        });
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

  showBothModels() {
    this.showBoth = true;
    this.electronService.saveDefaultModel('both');
    this.defaultModel = 'both';
  }

  showOpenAIOnly() {
    this.showBoth = false;
    this.electronService.saveDefaultModel('openai');
    this.defaultModel = 'openai';
  }

  showGeminiOnly() {
    this.showBoth = false;
    this.electronService.saveDefaultModel('gemini');
    this.defaultModel = 'gemini';
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

