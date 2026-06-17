import { Component, OnInit, ViewChild, ElementRef, AfterViewChecked, NgZone, ChangeDetectorRef, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { ElectronService, HistoryItem } from '../../services/electron.service';
import { MarkdownService } from '../../services/markdown.service';
import { VoiceRecorderService } from '../../services/voice-recorder.service';
import { DEFAULTS, AIProvider } from '../../constants/settings';

/** Providers that support token streaming via the `ai-stream` IPC channel. */
type StreamProvider = 'openai' | 'gemini' | 'claude' | 'zai' | 'lmstudio';

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
  claudeResponse: string = '';
  lmstudioResponse: string = '';
  zaiResponse: string = '';
  openaiUsage: any = null;
  geminiUsage: any = null;
  zaiUsage: any = null;
  lmstudioUsage: any = null;
  claudeUsage: any = null;
  defaultModel: AIProvider | string = DEFAULTS.MODEL;
  showBoth: boolean = true;
  isLoading: boolean = false;
  screenshots: string[] = [];
  
  // Flexible provider selection
  openaiEnabled: boolean = true;
  geminiEnabled: boolean = true;
  zaiEnabled: boolean = false;
  claudeEnabled: boolean = true;
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
  renderedNoteContent: string = '';
  isEditingNote: boolean = false;

  // Conversation history for context
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  isConversationMode: boolean = false;
  currentHistoryItemId: string | null = null;

  // In-flight token streams, keyed by requestId. Each accumulates raw text as
  // `ai-stream` chunks arrive and throttle-renders markdown into its panel.
  private activeStreams = new Map<string, {
    provider: StreamProvider;
    updateFn: (html: string) => void;
    raw: string;
    flushScheduled: boolean;
  }>();

  // Voice recording state
  isRecording: boolean = false;
  isTranscribing: boolean = false;
  recordingSeconds: number = 0;
  private recordingTimer: any = null;
  private voiceProvider: 'openai' | 'gemini' = 'openai';
  private voiceScreenshotMode: 'full' | 'region' | 'none' = 'full';

  // Note view mode setting (loaded from main process). 'alongside' makes the
  // active note render as another column next to the AI responses; 'editor-only'
  // keeps it hidden outside the note editor.
  noteViewMode: 'editor-only' | 'alongside' = 'editor-only';
  /** Pre-rendered HTML of the active note for the alongside panel. */
  renderedActiveNoteContent: string = '';
  /** Title of the active note (shown as the alongside panel header). */
  activeNoteTitleForView: string = '';

  @Input() continuedItem: HistoryItem | null = null;
  @Output() itemLoaded = new EventEmitter<void>();

  @ViewChild('openaiResponseContainer') openaiResponseContainer!: ElementRef;
  @ViewChild('geminiResponseContainer') geminiResponseContainer!: ElementRef;
  @ViewChild('claudeResponseContainer') claudeResponseContainer!: ElementRef;
  @ViewChild('lmstudioResponseContainer') lmstudioResponseContainer!: ElementRef;
  @ViewChild('zaiResponseContainer') zaiResponseContainer!: ElementRef;
  @ViewChild('notePreviewContainer') notePreviewContainer?: ElementRef;
  @ViewChild('activeNoteAlongsideContainer') activeNoteAlongsideContainer?: ElementRef;
  @ViewChild('notesListPreviewContainer') notesListPreviewContainer?: ElementRef;

  constructor(
    private electronService: ElectronService,
    private markdownService: MarkdownService,
    private voiceRecorder: VoiceRecorderService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.loadSettings();
    this.loadScreenshots();
    this.loadDocuments();
    this.loadNotes();
    this.loadVoiceProvider();
    this.setupEventListeners();
  }

  async loadVoiceProvider() {
    try {
      const [provider, screenshotMode, noteView] = await Promise.all([
        this.electronService.getVoiceProvider(),
        this.electronService.getVoiceScreenshotMode(),
        this.electronService.getNoteViewMode(),
      ]);
      this.voiceProvider = provider;
      this.voiceScreenshotMode = screenshotMode;
      this.noteViewMode = noteView || 'editor-only';
    } catch {
      this.voiceProvider = 'openai';
      this.voiceScreenshotMode = 'full';
      this.noteViewMode = 'editor-only';
    }
    // The mode may have changed while we were on the settings tab — refresh
    // the alongside panel so it shows/hides without needing a page reload.
    await this.refreshAlongsideNote();
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
    this.claudeResponse = item.claudeResponse || '';
    this.lmstudioResponse = item.lmstudioResponse || '';
    this.zaiResponse = (item as any).zaiResponse || '';
    
    // Store the history item ID for updating later
    this.currentHistoryItemId = item.id;
    
    // Build conversation history from the continued item
    this.conversationHistory = [];
    if (item.prompt) {
      this.conversationHistory.push({ role: 'user', content: item.prompt });
    }
    // Use the raw response text (strip HTML for context). Pick whichever
    // provider actually answered — previously this only looked at OpenAI, so
    // continuing a Gemini/Z.AI/LM Studio session had no assistant context.
    const priorResponse =
      item.openaiResponse || item.geminiResponse || item.claudeResponse || item.zaiResponse || item.lmstudioResponse;
    if (priorResponse) {
      const textContent = this.stripHtml(priorResponse);
      this.conversationHistory.push({ role: 'assistant', content: textContent });
    }
    
    this.isConversationMode = true;
    this.cdr.detectChanges();
    this.scheduleMarkdownRender();
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
    this.claudeResponse = '';
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
    // Keep the alongside-view panel in sync with whichever note is now active.
    await this.refreshAlongsideNote();
  }

  /**
   * Fetch the active note's full content and pre-render it (markdown + KaTeX)
   * using the same `MarkdownService` as the editor preview — so output is
   * byte-identical between every view. The rendered HTML is used by:
   *   - the inline preview shown under the clicked note in the notes list
   *     (always on, lets the user read a note without opening the editor)
   *   - the "alongside" column next to the AI responses (only when the
   *     Note Display setting is set to 'alongside')
   * Visibility of each is gated in the template; the data is shared.
   */
  async refreshAlongsideNote() {
    const active = this.getActiveNote();
    if (!active) {
      this.renderedActiveNoteContent = '';
      this.activeNoteTitleForView = '';
      this.cdr.detectChanges();
      return;
    }
    try {
      const result = await this.electronService.getNote(active.id);
      if (result.success && result.note) {
        this.activeNoteTitleForView = result.note.title || 'Note';
        this.renderedActiveNoteContent = result.note.content
          ? this.markdownService.renderMarkdown(result.note.content)
          : '';
      } else {
        this.renderedActiveNoteContent = '';
        this.activeNoteTitleForView = '';
      }
    } catch {
      this.renderedActiveNoteContent = '';
      this.activeNoteTitleForView = '';
    }
    this.cdr.detectChanges();
    this.scheduleMarkdownRender();
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
    this.updateNotePreview();
    this.showNoteEditor = true;
  }

  async openEditNoteEditor(noteId: string) {
    const result = await this.electronService.getNote(noteId);
    if (result.success && result.note) {
      this.isEditingNote = true;
      this.currentNoteId = noteId;
      this.noteTitle = result.note.title;
      this.noteContent = result.note.content;
      this.updateNotePreview();
      this.showNoteEditor = true;
      this.cdr.detectChanges();
    }
  }

  closeNoteEditor() {
    this.showNoteEditor = false;
    this.currentNoteId = null;
    this.noteTitle = '';
    this.noteContent = '';
    this.renderedNoteContent = '';
    this.isEditingNote = false;
  }

  /**
   * Re-render the live markdown+KaTeX preview from the textarea content.
   * Called on every keystroke via (ngModelChange) so the user can verify
   * LaTeX renders correctly as they type. KaTeX auto-render is applied
   * separately in ngAfterViewChecked after the DOM updates.
   */
  updateNotePreview() {
    this.renderedNoteContent = this.noteContent
      ? this.markdownService.renderMarkdown(this.noteContent)
      : '';
    this.scheduleMarkdownRender();
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
    // Intentionally empty. KaTeX/highlight rendering is triggered explicitly via
    // scheduleMarkdownRender() after each content change. Re-rendering on every
    // change-detection pass ran the full KaTeX + highlight.js pass dozens of
    // times during streaming and made the answer flicker until it completed.
  }

  /**
   * Run highlight.js + KaTeX auto-render over every preview/response container.
   * Safe to call repeatedly (both libraries are idempotent on already-rendered
   * content).
   */
  private renderMarkdownTargets() {
    this.markdownService.highlightCodeBlocks();

    const targets = [
      this.openaiResponseContainer,
      this.geminiResponseContainer,
      this.claudeResponseContainer,
      this.lmstudioResponseContainer,
      this.zaiResponseContainer,
      this.notePreviewContainer,
      this.activeNoteAlongsideContainer,
      this.notesListPreviewContainer,
    ];
    for (const ref of targets) {
      if (ref?.nativeElement) {
        this.markdownService.renderMathInElement(ref.nativeElement);
      }
    }
  }

  /**
   * Render markdown targets on the next macrotask. When content is set
   * programmatically (note preview, alongside panel, continued item), the
   * *ngIf containers and their @ViewChild refs aren't resolved until after the
   * current change-detection pass — so ngAfterViewChecked alone missed the
   * first render until a later pass (e.g. switching tabs and back). Deferring
   * guarantees the DOM is in place before we render.
   */
  private scheduleMarkdownRender() {
    // Render on the next macrotask, once the DOM (including any *ngIf containers
    // and their @ViewChild refs) has settled. KaTeX/highlight mutate the DOM
    // directly, so this runs the pass exactly once per content change rather
    // than on every change-detection tick.
    setTimeout(() => this.renderMarkdownTargets());
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
        'zai':      ['zai'],
        'claude':   ['claude']
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
      this.claudeEnabled = false;
    } else {
      // Otherwise, check inclusion for each cloud provider
      this.openaiEnabled = providers.includes('openai');
      this.geminiEnabled = providers.includes('gemini');
      this.zaiEnabled = providers.includes('zai');
      this.claudeEnabled = providers.includes('claude');
    }
  }

  setupEventListeners() {
    // Token stream chunks — route each to its panel's accumulator.
    this.electronService.onAIStream().subscribe((evt) => {
      this.onStreamDelta(evt);
    });

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

    // Voice recording shortcut (Ctrl+Shift+V)
    this.electronService.onToggleVoiceRecording().subscribe(() => {
      this.toggleVoiceRecording();
    });

    // Token usage updates
    this.electronService.onTokenUsageUpdated().subscribe((data) => {
      this.ngZone.run(() => {
        if (data.provider === 'openai') {
          this.openaiUsage = data;
        } else if (data.provider === 'gemini') {
          this.geminiUsage = data;
        } else if (data.provider === 'zai') {
          this.zaiUsage = data;
        } else if (data.provider === 'lmstudio') {
          this.lmstudioUsage = data;
        } else if (data.provider === 'claude') {
          this.claudeUsage = data;
        }
        this.cdr.detectChanges();
      });
    });
  }

  async toggleVoiceRecording() {
    if (this.isTranscribing) return;
    if (this.isRecording) {
      await this.stopVoiceRecording();
    } else {
      await this.startVoiceRecording();
    }
  }

  async startVoiceRecording() {
    try {
      // Refresh provider in case the user changed it in settings
      await this.loadVoiceProvider();
      await this.voiceRecorder.start();
      this.ngZone.run(() => {
        this.isRecording = true;
        this.recordingSeconds = 0;
        this.recordingTimer = setInterval(() => {
          this.ngZone.run(() => {
            this.recordingSeconds += 1;
            this.cdr.detectChanges();
          });
        }, 1000);
        this.cdr.detectChanges();
      });
    } catch (err: any) {
      this.electronService.showToast(`Voice: ${err.message || 'Failed to start recording'}`);
      this.ngZone.run(() => {
        this.isRecording = false;
        this.cdr.detectChanges();
      });
    }
  }

  async stopVoiceRecording() {
    if (!this.isRecording) return;

    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    let recording: { blob: Blob; mimeType: string; durationMs: number };
    try {
      recording = await this.voiceRecorder.stop();
    } catch (err: any) {
      this.electronService.showToast(`Voice: ${err.message || 'Recording failed'}`);
      this.ngZone.run(() => {
        this.isRecording = false;
        this.cdr.detectChanges();
      });
      return;
    }

    this.ngZone.run(() => {
      this.isRecording = false;
      this.isTranscribing = true;
      this.cdr.detectChanges();
    });

    // A voice recording owns its own screenshot context: prior captures (from
    // earlier voice turns or manual snips) must not leak into a fresh question,
    // so we wipe the queue first and then capture per the selected mode:
    //   full   — entire primary display (default, fastest)
    //   region — user drags to select a region (focused context)
    //   none   — skip the screenshot entirely (transcript-only prompt)
    try {
      const audioBuffer = await recording.blob.arrayBuffer();

      // Kick off transcription immediately — it doesn't depend on screenshots.
      const transcriptionPromise = this.electronService.transcribeAudio(
        audioBuffer, recording.mimeType, this.voiceProvider,
      );

      await this.clearScreenshots();
      const screenshotResult: any =
        this.voiceScreenshotMode === 'none'
          ? { success: true }
          : this.voiceScreenshotMode === 'region'
            ? await this.electronService.takeRegionScreenshot()
            : await this.electronService.takeScreenshot();

      const transcription = await transcriptionPromise;

      if (!transcription.success || !transcription.text || !transcription.text.trim()) {
        this.electronService.showToast(transcription.error || 'No speech detected');
        this.ngZone.run(() => {
          this.isTranscribing = false;
          this.cdr.detectChanges();
        });
        return;
      }

      // Reload screenshots so the queue reflects the new capture
      if (screenshotResult.success) {
        await this.loadScreenshots();
      }

      const transcript = transcription.text.trim();
      this.ngZone.run(() => {
        this.userInput = transcript;
        this.isTranscribing = false;
        this.cdr.detectChanges();
      });

      // Hand off to the existing prompt pipeline — it already handles screenshots.
      await this.sendPrompt();
    } catch (err: any) {
      this.electronService.showToast(`Voice: ${err.message || 'Failed to process recording'}`);
      this.ngZone.run(() => {
        this.isTranscribing = false;
        this.cdr.detectChanges();
      });
    }
  }

  formatRecordingTime(): string {
    const s = this.recordingSeconds;
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
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
    if (!this.claudeEnabled) {
      this.claudeResponse = '';
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
    if (this.claudeEnabled) providers.push('Claude');
    if (this.zaiEnabled) providers.push('Z.AI');
    return providers.length > 0 ? providers.join(' + ') : 'No provider';
  }

  /**
   * Animated "AI is working" placeholder shown in a response panel while a
   * request is in flight. Styled by the global `.thinking` rules; the dots
   * pulse and the panel itself gets a scanning beam via `.loading`.
   */
  private thinkingHtml(label: string): string {
    return `<div class="thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="label">${label}</span></div>`;
  }

  // =====================
  // Token Streaming
  // =====================

  /** Unique id so the main process can tag stream chunks back to a panel. */
  private genRequestId(provider: StreamProvider): string {
    return `${provider}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Register a panel to receive streamed tokens for the given request. */
  private beginStream(requestId: string, provider: StreamProvider, updateFn: (html: string) => void): void {
    this.activeStreams.set(requestId, { provider, updateFn, raw: '', flushScheduled: false });
  }

  /** Stop routing chunks to a panel (the final render is done by the awaited call). */
  private endStream(requestId: string): void {
    this.activeStreams.delete(requestId);
  }

  /** Accumulate a chunk and schedule a throttled markdown re-render. */
  private onStreamDelta(evt: { requestId: string; provider: string; delta: string }): void {
    const entry = this.activeStreams.get(evt.requestId);
    if (!entry) return;
    entry.raw += evt.delta;
    if (!entry.flushScheduled) {
      entry.flushScheduled = true;
      // Coalesce bursts of tokens — re-rendering markdown + KaTeX on every
      // single token is wasteful and janky for long answers.
      setTimeout(() => this.flushStream(evt.requestId), 50);
    }
  }

  /** Render the accumulated raw text as markdown into the panel. */
  private flushStream(requestId: string): void {
    const entry = this.activeStreams.get(requestId);
    if (!entry) return;
    entry.flushScheduled = false;
    const html = this.markdownService.renderMarkdown(entry.raw);
    this.ngZone.run(() => {
      entry.updateFn(html);
      this.cdr.detectChanges();
      // Note: we deliberately do NOT run KaTeX here. Code is highlighted inline
      // by renderMarkdown(), so it stays styled as it streams, but math is left
      // as raw `$…$` until the stream finishes — re-running KaTeX on every flush
      // made formulas flicker between raw and rendered. The awaited completion
      // path (handleProviderRequest) calls scheduleMarkdownRender() once to do
      // the final KaTeX pass.
    });
  }

  // =====================
  // Generic Provider Request Handler
  // =====================

  /**
   * Generic handler for any AI provider request.
   * Handles try/catch, markdown rendering, and UI updates in a unified way.
   * When `provider` is supplied, a streaming requestId is generated and passed
   * to `apiCall`; incoming `ai-stream` chunks update the panel live, and the
   * awaited result does the final clean render.
   * @param apiCall - The async function that returns the raw string response.
   * @param updateFn - The callback to update the specific UI property.
   * @param provider - Provider whose tokens should stream into this panel (optional).
   * @returns Promise<string> - The raw response (or empty string on error) for history tracking.
   */
  private async handleProviderRequest(
    apiCall: (requestId: string) => Promise<string>,
    updateFn: (formattedHtml: string) => void,
    provider?: StreamProvider
  ): Promise<string> {
    const requestId = provider ? this.genRequestId(provider) : '';
    if (provider) this.beginStream(requestId, provider, updateFn);
    try {
      const raw = await apiCall(requestId);
      const formatted = this.markdownService.renderMarkdown(raw);
      this.ngZone.run(() => {
        updateFn(formatted);
        this.cdr.detectChanges();
        this.scheduleMarkdownRender();
      });
      return raw; // Return raw text for history/conversation
    } catch (err: any) {
      const errorMsg = `**Error:** ${err.message || 'Request failed'}`;
      const formattedError = this.markdownService.renderMarkdown(errorMsg);
      this.ngZone.run(() => {
        updateFn(formattedError);
        this.cdr.detectChanges();
        this.scheduleMarkdownRender();
      });
      return ''; // Return empty so history ignores errors
    } finally {
      if (provider) this.endStream(requestId);
    }
  }

  /**
   * Handler for screenshot analysis requests (returns { success, analysis, error }).
   * Streams tokens into the panel when `provider` is supplied (requestId is
   * threaded through the options object by the caller).
   */
  private async handleScreenshotAnalysis(
    apiCall: (requestId: string) => Promise<{ success: boolean; analysis?: string; error?: string }>,
    updateFn: (formattedHtml: string) => void,
    provider?: StreamProvider
  ): Promise<string> {
    const requestId = provider ? this.genRequestId(provider) : '';
    if (provider) this.beginStream(requestId, provider, updateFn);
    try {
      const result = await apiCall(requestId);
      let formatted: string;
      if (result.success && result.analysis) {
        formatted = this.markdownService.renderMarkdown(result.analysis);
      } else {
        formatted = this.markdownService.renderMarkdown(`**Error:** ${result.error || 'Failed to analyze screenshots'}`);
      }
      this.ngZone.run(() => {
        updateFn(formatted);
        this.cdr.detectChanges();
        this.scheduleMarkdownRender();
      });
      return result.success && result.analysis ? result.analysis : '';
    } catch (err: any) {
      const errorMsg = `**Error:** ${err.message || 'Analysis failed'}`;
      const formattedError = this.markdownService.renderMarkdown(errorMsg);
      this.ngZone.run(() => {
        updateFn(formattedError);
        this.cdr.detectChanges();
        this.scheduleMarkdownRender();
      });
      return '';
    } finally {
      if (provider) this.endStream(requestId);
    }
  }

  async sendPrompt() {
    const prompt = this.userInput.trim();
    if (!prompt) return;

    // Immediately clear input and set loading state
    const savedPrompt = prompt;
    this.userInput = '';
    this.isLoading = true;

    // Check if we have screenshots to include. Snapshot the count now so a
    // concurrent prompt clearing/adding screenshots can't change what this
    // request records in history.
    const hasScreenshots = this.screenshots.length > 0;
    const screenshotCountSnapshot = this.screenshots.length;

    // Add user message to conversation history if in conversation mode
    if (this.isConversationMode) {
      this.conversationHistory.push({ role: 'user', content: savedPrompt });
    }

    // Set loading indicators for all active providers
    if (this.openaiEnabled && !this.lmstudioMode) {
      this.openaiResponse = this.thinkingHtml('Thinking…');
      this.openaiUsage = null;
    }
    if (this.geminiEnabled && !this.lmstudioMode) {
      this.geminiResponse = this.thinkingHtml('Thinking…');
      this.geminiUsage = null;
    }
    if (this.zaiEnabled && !this.lmstudioMode) {
      this.zaiResponse = this.thinkingHtml('Thinking…');
      this.zaiUsage = null;
    }
    if (this.claudeEnabled && !this.lmstudioMode) {
      this.claudeResponse = this.thinkingHtml('Thinking…');
      this.claudeUsage = null;
    }
    if (this.lmstudioMode) {
      this.lmstudioResponse = this.thinkingHtml('Thinking…');
      this.lmstudioUsage = null;
    }
    this.cdr.detectChanges();

    // Build array of parallel tasks
    interface ProviderTask {
      name: 'openai' | 'gemini' | 'zai' | 'lmstudio' | 'claude';
      promise: Promise<string>;
    }
    const tasks: ProviderTask[] = [];

    // OpenAI
    if (this.openaiEnabled && !this.lmstudioMode) {
      const apiCall = (requestId: string) => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToOpenAI(this.conversationHistory, requestId);
        } else if (hasScreenshots) {
          return this.electronService.sendPromptWithScreenshotsToOpenAI(savedPrompt, requestId);
        } else {
          return this.electronService.sendPromptToOpenAI(savedPrompt, requestId);
        }
      };
      tasks.push({
        name: 'openai',
        promise: this.handleProviderRequest(apiCall, (html) => this.openaiResponse = html, 'openai')
      });
    }

    // Gemini
    if (this.geminiEnabled && !this.lmstudioMode) {
      const apiCall = (requestId: string) => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToGemini(this.conversationHistory, requestId);
        } else if (hasScreenshots) {
          return this.electronService.sendPromptWithScreenshotsToGemini(savedPrompt, requestId);
        } else {
          return this.electronService.sendPromptToGemini(savedPrompt, requestId);
        }
      };
      tasks.push({
        name: 'gemini',
        promise: this.handleProviderRequest(apiCall, (html) => this.geminiResponse = html, 'gemini')
      });
    }

    // Claude
    if (this.claudeEnabled && !this.lmstudioMode) {
      const apiCall = (requestId: string) => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToClaude(this.conversationHistory, requestId);
        } else if (hasScreenshots) {
          return this.electronService.sendPromptWithScreenshotsToClaude(savedPrompt, requestId);
        } else {
          return this.electronService.sendPromptToClaude(savedPrompt, requestId);
        }
      };
      tasks.push({
        name: 'claude',
        promise: this.handleProviderRequest(apiCall, (html) => this.claudeResponse = html, 'claude')
      });
    }

    // Z.AI (now supports screenshots via vision model)
    if (this.zaiEnabled && !this.lmstudioMode) {
      const apiCall = (requestId: string) => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToZAI(this.conversationHistory, requestId);
        } else if (hasScreenshots) {
          return this.electronService.sendPromptWithScreenshotsToZAI(savedPrompt, requestId);
        } else {
          return this.electronService.sendPromptToZAI(savedPrompt, requestId);
        }
      };
      tasks.push({
        name: 'zai',
        promise: this.handleProviderRequest(apiCall, (html) => this.zaiResponse = html, 'zai')
      });
    }

    // LM Studio (local, text-only)
    if (this.lmstudioMode) {
      const apiCall = (requestId: string) => {
        if (this.isConversationMode) {
          return this.electronService.sendConversationToLMStudio(this.conversationHistory, requestId);
        } else {
          return this.electronService.sendPromptToLMStudio(savedPrompt, requestId);
        }
      };
      tasks.push({
        name: 'lmstudio',
        promise: this.handleProviderRequest(apiCall, (html) => this.lmstudioResponse = html, 'lmstudio')
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
      const rawClaude = responseMap['claude'] || '';
      const rawZai = responseMap['zai'] || '';
      const rawLmstudio = responseMap['lmstudio'] || '';

      // Add assistant response to conversation history if in conversation mode
      if (this.isConversationMode) {
        const assistantResponse = rawOpenai || rawGemini || rawClaude || rawLmstudio || rawZai;
        if (assistantResponse) {
          this.conversationHistory.push({ role: 'assistant', content: assistantResponse });
        }
      }

      // Render each provider's response from THIS request's own raw result.
      // We must not read this.*Response here: those shared fields can already
      // hold a concurrent prompt's answer (e.g. the user switched model and
      // asked again before this call resolved), which would make every history
      // item collapse onto the latest answer.
      const htmlOpenai = rawOpenai ? this.markdownService.renderMarkdown(rawOpenai) : '';
      const htmlGemini = rawGemini ? this.markdownService.renderMarkdown(rawGemini) : '';
      const htmlClaude = rawClaude ? this.markdownService.renderMarkdown(rawClaude) : '';
      const htmlLmstudio = rawLmstudio ? this.markdownService.renderMarkdown(rawLmstudio) : '';
      const htmlZai = rawZai ? this.markdownService.renderMarkdown(rawZai) : '';

      // Save or update history
      const hasAnyResponse = rawOpenai || rawGemini || rawClaude || rawLmstudio || rawZai;
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
            screenshotCount: hasScreenshots ? screenshotCountSnapshot : 0,
            openaiResponse: htmlOpenai,
            geminiResponse: htmlGemini,
            claudeResponse: htmlClaude,
            lmstudioResponse: htmlLmstudio,
            zaiResponse: htmlZai
          } as any);
        } else {
          // Create new history item. Add a random suffix so two prompts that
          // resolve in the same millisecond don't share an id (which would let
          // one overwrite the other on update).
          this.electronService.saveHistoryItem({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            timestamp: new Date(),
            prompt: savedPrompt,
            screenshotCount: hasScreenshots ? screenshotCountSnapshot : 0,
            openaiResponse: htmlOpenai,
            geminiResponse: htmlGemini,
            claudeResponse: htmlClaude,
            lmstudioResponse: htmlLmstudio,
            zaiResponse: htmlZai
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
      this.openaiResponse = this.thinkingHtml('Processing clipboard text…');
      this.geminiResponse = this.thinkingHtml('Processing clipboard text…');
      this.claudeResponse = this.thinkingHtml('Processing clipboard text…');
      this.lmstudioResponse = this.thinkingHtml('Processing clipboard text…');
      this.zaiResponse = this.thinkingHtml('Processing clipboard text…');
      this.openaiUsage = null;
      this.geminiUsage = null;
      this.claudeUsage = null;
      this.lmstudioUsage = null;
      this.zaiUsage = null;
      this.cdr.detectChanges();

      const result = await this.electronService.processClipboardPrompt();
      
      let savedOpenaiResponse = '';
      let savedGeminiResponse = '';
      let savedClaudeResponse = '';
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

          if (result.claudeResponse) {
            savedClaudeResponse = this.markdownService.renderMarkdown(result.claudeResponse);
            this.claudeResponse = savedClaudeResponse;
          } else {
            this.claudeResponse = '<p>Claude model not selected or failed</p>';
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
          this.claudeResponse = errorMsg;
          this.lmstudioResponse = errorMsg;
          this.zaiResponse = errorMsg;
        }
        this.cdr.detectChanges();
        this.scheduleMarkdownRender();
      });

      // Save to history if we got responses
      if (savedOpenaiResponse || savedGeminiResponse || savedClaudeResponse || savedLmstudioResponse || savedZaiResponse) {
        this.electronService.saveHistoryItem({
          id: Date.now().toString(),
          timestamp: new Date(),
          prompt: promptText || 'Clipboard prompt',
          screenshotCount: 0,
          openaiResponse: savedOpenaiResponse,
          geminiResponse: savedGeminiResponse,
          claudeResponse: savedClaudeResponse,
          lmstudioResponse: savedLmstudioResponse,
          zaiResponse: savedZaiResponse
        } as any);
      }
    } catch (error: any) {
      this.ngZone.run(() => {
        const errorMsg = this.markdownService.renderMarkdown(`**Error:** ${error.message}`);
        this.openaiResponse = errorMsg;
        this.geminiResponse = errorMsg;
        this.claudeResponse = errorMsg;
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
      this.openaiResponse = this.thinkingHtml('Analyzing screenshots…');
      this.openaiUsage = null;
    }
    if (this.geminiEnabled && !this.lmstudioMode) {
      this.geminiResponse = this.thinkingHtml('Analyzing screenshots…');
      this.geminiUsage = null;
    }
    if (this.claudeEnabled && !this.lmstudioMode) {
      this.claudeResponse = this.thinkingHtml('Analyzing screenshots…');
      this.claudeUsage = null;
    }
    if (this.zaiEnabled && !this.lmstudioMode) {
      this.zaiResponse = this.thinkingHtml('Analyzing screenshots…');
      this.zaiUsage = null;
    }
    if (this.lmstudioMode) {
      this.lmstudioResponse = '<p>LM Studio does not support image analysis</p>';
      this.lmstudioUsage = null;
    }
    this.cdr.detectChanges();

    try {
      const preferences = await this.electronService.getPreferences();
      const language = preferences.preferredLanguage || 'python';

      // Build array of parallel tasks
      interface ProviderTask {
        name: 'openai' | 'gemini' | 'zai' | 'claude';
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

      // Claude
      if (this.claudeEnabled && !this.lmstudioMode) {
        tasks.push({
          name: 'claude',
          promise: this.handleScreenshotAnalysis(
            () => this.electronService.analyzeScreenshotsWithClaude({ language }),
            (html) => this.claudeResponse = html
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
      const rawClaude = responseMap['claude'] || '';
      const rawZai = responseMap['zai'] || '';

      // Save to history if we got responses
      if (rawOpenai || rawGemini || rawClaude || rawZai) {
        this.electronService.saveHistoryItem({
          id: Date.now().toString(),
          timestamp: new Date(),
          prompt: `Screenshot analysis (${screenshotCount} image${screenshotCount > 1 ? 's' : ''})`,
          screenshotCount: screenshotCount,
          openaiResponse: this.openaiResponse,
          geminiResponse: this.geminiResponse,
          claudeResponse: this.claudeResponse,
          lmstudioResponse: '',
          zaiResponse: this.zaiResponse
        } as any);
      }
    } catch (error: any) {
      this.ngZone.run(() => {
        const errorMsg = this.markdownService.renderMarkdown(`**Error:** ${error.message}`);
        // Clear the spinner for every active provider, not just OpenAI/Gemini —
        // otherwise the Z.AI panel stayed stuck on "Analyzing…".
        if (this.openaiEnabled) this.openaiResponse = errorMsg;
        if (this.geminiEnabled) this.geminiResponse = errorMsg;
        if (this.claudeEnabled) this.claudeResponse = errorMsg;
        if (this.zaiEnabled) this.zaiResponse = errorMsg;
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
        // Use the full extracted text — truncating to 100 chars silently lost
        // the rest of the OCR/vision output.
        this.userInput = result.extractedText;
      }
    } catch (error: any) {
      console.error('Error extracting text:', error);
    }
  }

  onKeyDown(event: KeyboardEvent) {
    // Ignore Enter while an IME composition is in progress (CJK input), and let
    // Shift+Enter through without sending. Prevent the default so the keypress
    // doesn't also bubble as a form submit.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
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

