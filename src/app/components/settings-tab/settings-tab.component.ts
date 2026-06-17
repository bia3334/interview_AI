import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { ElectronService } from '../../services/electron.service';
import { DEFAULTS, AIProvider, AnswerStyle } from '../../constants/settings';
import { OCR_LANGUAGES, OCRSettings, DEFAULT_OCR_SETTINGS } from '../../constants/ocr';

interface SystemPromptTemplate {
  id: string;
  name: string;
  prompt: string;
}

// Provider types for connection testing
type ProviderType = 'openai' | 'gemini' | 'zai' | 'lmstudio' | 'claude';

@Component({
  selector: 'app-settings-tab',
  templateUrl: './settings-tab.component.html',
  styleUrls: ['./settings-tab.component.css'],
  standalone: false
})
export class SettingsTabComponent implements OnInit {
  // Sub-tab state
  activeSubTab: 'models' | 'behavior' | 'capture' | 'interface' | 'usage' = 'models';

  // Token usage
  accumulatedTokenUsage: any = {};

  // API & Models
  openaiApiKey: string = '';
  geminiApiKey: string = '';
  claudeApiKey: string = '';
  defaultModel: AIProvider | string = DEFAULTS.MODEL;
  
  // Provider enabled states (for flexible selection)
  openaiEnabled: boolean = true;
  geminiEnabled: boolean = true;
  zaiEnabled: boolean = false;
  claudeEnabled: boolean = true;
  
  // Custom model names for cloud providers
  openaiModel: string = 'gpt-5.2';
  geminiModel: string = 'gemini-3.0-flash-review';
  claudeModel: string = 'claude-sonnet-4-6';
  
  // Unified loading state for all testable services
  loadingState: Record<string, boolean> = {
    openai: false,
    gemini: false,
    zai: false,
    claude: false,
    lmstudio: false,
    ocr: false
  };

  // LM Studio Settings
  lmstudioEnabled: boolean = false;
  lmstudioEndpoint: string = 'http://localhost:1234/v1';
  lmstudioModel: string = 'local-model';

  // Z.AI Settings
  zaiApiKey: string = '';
  zaiModel: string = 'GLM-4.6V-Flash';

  // Voice Transcription
  voiceProvider: 'openai' | 'gemini' = 'openai';
  voiceScreenshotMode: 'full' | 'region' | 'none' = 'full';

  // Window Behavior
  autoInteractionOnShow: boolean = false;

  // Note view mode — controls where rendered notes appear
  noteViewMode: 'editor-only' | 'alongside' = 'editor-only';

  // AI Behavior
  preferredLanguage: string = DEFAULTS.LANGUAGE;
  answerStyle: AnswerStyle = DEFAULTS.ANSWER_STYLE;
  customSystemPrompt: string = '';
  
  // OCR Settings
  ocrEnabled: boolean = DEFAULT_OCR_SETTINGS.enabled;
  ocrLanguage: string = DEFAULT_OCR_SETTINGS.language;
  ocrLanguages = OCR_LANGUAGES;
  
  // Documents
  activeDocInfo: { hasContext: boolean; fileName?: string; length?: number; hasKeyInfo?: boolean } = { hasContext: false };
  documents: Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean; hasKeyInfo?: boolean; keyInfoLength?: number }> = [];

  // Key Info Modal
  showKeyInfoModal: boolean = false;
  keyInfoData: { fileName?: string; keyInfo?: string; hasKeyInfo?: boolean; contentLength?: number; keyInfoLength?: number; filePath?: string } | null = null;
  isEditingKeyInfo: boolean = false;
  editedKeyInfo: string = '';
  currentKeyInfoFilePath: string = '';

  // Rename Dialog
  showRenameDialog: boolean = false;
  renameDocPath: string = '';
  renameNewName: string = '';

  // Template management
  showSaveTemplateDialog: boolean = false;
  newTemplateName: string = '';
  editingTemplateId: string | null = null;
  activeTemplateId: string | null = null;

  // All templates (loaded from store - all are editable)
  templates: SystemPromptTemplate[] = [];

  constructor(
    private electronService: ElectronService,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  // =====================
  // Helper Methods
  // =====================

  /**
   * Run a function inside NgZone and trigger change detection.
   * Removes the boilerplate of this.ngZone.run(...) + this.cdr.detectChanges()
   */
  private runInZone(fn: () => void): void {
    this.ngZone.run(() => {
      fn();
      this.cdr.detectChanges();
    });
  }

  /**
   * Unified connection test for all providers.
   * Auto-saves the provider's settings before testing.
   */
  async testConnection(provider: ProviderType): Promise<void> {
    if (this.loadingState[provider]) return; // Prevent double-click

    this.loadingState[provider] = true;
    this.cdr.detectChanges();

    try {
      // Save provider settings before testing
      await this.saveProviderSettings(provider);

      // Call the appropriate test method
      let result: { success: boolean; model?: string; error?: string };
      switch (provider) {
        case 'openai':
          result = await this.electronService.testOpenAIConnection();
          break;
        case 'gemini':
          result = await this.electronService.testGeminiConnection();
          break;
        case 'zai':
          result = await this.electronService.testZAIConnection();
          break;
        case 'claude':
          result = await this.electronService.testClaudeConnection();
          break;
        case 'lmstudio':
          result = await this.electronService.testLMStudioConnection();
          break;
        default:
          result = { success: false, error: 'Unknown provider' };
      }

      // Show result toast
      this.runInZone(() => {
        this.loadingState[provider] = false;
        if (result.success) {
          const modelInfo = result.model ? ` Model: ${result.model}` : '';
          this.electronService.showToast(`${this.getProviderDisplayName(provider)} connected!${modelInfo}`);
        } else {
          this.electronService.showToast(result.error || `Failed to connect to ${this.getProviderDisplayName(provider)}`);
        }
      });
    } catch (error: any) {
      this.runInZone(() => {
        this.loadingState[provider] = false;
        this.electronService.showToast(`Error: ${error.message}`);
      });
    }
  }

  /**
   * Save settings for a specific provider before testing.
   */
  private async saveProviderSettings(provider: ProviderType): Promise<void> {
    switch (provider) {
      case 'openai':
        await this.electronService.saveOpenAIModel(this.openaiModel.trim() || 'gpt-5.2');
        break;
      case 'gemini':
        await this.electronService.saveGeminiModel(this.geminiModel.trim() || 'gemini-3-flash-preview');
        break;
      case 'claude':
        await this.electronService.saveClaudeModel(this.claudeModel.trim() || 'claude-sonnet-4-6');
        break;
      case 'zai':
        await this.electronService.saveZAISettings({
          enabled: true,
          model: this.zaiModel.trim() || 'GLM-4.6V-Flash'
        });
        break;
      case 'lmstudio':
        await this.electronService.saveLMStudioSettings({
          enabled: this.lmstudioEnabled,
          endpoint: this.lmstudioEndpoint,
          model: this.lmstudioModel
        });
        break;
    }
  }

  /**
   * Get human-readable provider name for toasts.
   */
  private getProviderDisplayName(provider: ProviderType): string {
    const names: Record<ProviderType, string> = {
      openai: 'OpenAI',
      gemini: 'Gemini',
      zai: 'Z.AI',
      claude: 'Claude',
      lmstudio: 'LM Studio'
    };
    return names[provider];
  }

  ngOnInit() {
    this.loadSettings();
    this.loadDocuments();
    this.loadTemplates();
    this.loadOCRSettings();
    this.loadAccumulatedTokenUsage();
    this.setupEventListeners();
  }

  async switchSubTab(tab: 'models' | 'behavior' | 'capture' | 'interface' | 'usage') {
    this.activeSubTab = tab;

    // Reload saved settings when switching tabs to discard unsaved changes
    if (tab === 'behavior') {
      // Reload the saved system prompt to discard any unsaved changes
      const savedPrompt = await this.electronService.getCustomSystemPrompt();
      this.ngZone.run(() => {
        this.customSystemPrompt = savedPrompt || '';
        this.detectActiveTemplate();
        this.cdr.detectChanges();
      });
    } else if (tab === 'capture') {
      // OCR lives in the Capture tab — refresh its saved state
      await this.loadOCRSettings();
    } else if (tab === 'usage') {
      await this.loadAccumulatedTokenUsage();
    }
  }

  async loadSettings() {
    const [openaiKey, geminiKey, zaiKey, claudeKey, preferences, defaultModel, customPrompt, lmstudioSettings, zaiSettings, openaiModelSetting, geminiModelSetting, claudeModelSetting, voiceProvider, voiceScreenshotMode, autoInteractionOnShow, noteViewMode] = await Promise.all([
      this.electronService.getOpenAIApiKey(),
      this.electronService.getGeminiApiKey(),
      this.electronService.getZAIApiKey(),
      this.electronService.getClaudeApiKey(),
      this.electronService.getPreferences(),
      this.electronService.getDefaultModel(),
      this.electronService.getCustomSystemPrompt(),
      this.electronService.getLMStudioSettings(),
      this.electronService.getZAISettings(),
      this.electronService.getOpenAIModel(),
      this.electronService.getGeminiModel(),
      this.electronService.getClaudeModel(),
      this.electronService.getVoiceProvider(),
      this.electronService.getVoiceScreenshotMode(),
      this.electronService.getAutoInteractionOnShow(),
      this.electronService.getNoteViewMode()
    ]);
    this.voiceProvider = voiceProvider || 'openai';
    this.voiceScreenshotMode = voiceScreenshotMode || 'full';
    this.autoInteractionOnShow = !!autoInteractionOnShow;
    this.noteViewMode = noteViewMode || 'editor-only';

    this.openaiApiKey = openaiKey || '';
    this.geminiApiKey = geminiKey || '';
    this.zaiApiKey = zaiKey || '';
    this.claudeApiKey = claudeKey || '';
    this.preferredLanguage = preferences.preferredLanguage || 'python';
    this.answerStyle = (preferences.answerStyle as any) || 'explanation';
    this.defaultModel = defaultModel;
    this.customSystemPrompt = customPrompt || '';
    
    // Custom model names
    this.openaiModel = openaiModelSetting || 'gpt-4o';
    this.geminiModel = geminiModelSetting || 'gemini-2.0-flash';
    this.claudeModel = claudeModelSetting || 'claude-sonnet-4-6';
    
    // LM Studio settings
    this.lmstudioEnabled = lmstudioSettings.enabled;
    this.lmstudioEndpoint = lmstudioSettings.endpoint;
    this.lmstudioModel = lmstudioSettings.model;
    
    // Z.AI settings
    this.zaiModel = zaiSettings.model;
    
    // Parse enabled providers from defaultModel (for backward compatibility)
    // or use new enabledProviders setting
    this.parseEnabledProviders(defaultModel);
    
    this.detectActiveTemplate();
  }

  // Parse the defaultModel setting into individual enabled states
  parseEnabledProviders(model: string) {
    let providers: string[] = [];

    // 1. Try to parse as JSON array (New Format)
    try {
      const parsed = JSON.parse(model);
      if (Array.isArray(parsed)) providers = parsed;
    } catch {
      // Not JSON, proceed to legacy check
    }

    // 2. If not found yet, map Legacy Aliases to Arrays
    if (providers.length === 0) {
      const legacyAliases: Record<string, string[]> = {
        'all':      ['openai', 'gemini', 'zai', 'claude'],
        'both':     ['openai', 'gemini'],
        'openai':   ['openai'],
        'gemini':   ['gemini'],
        'zai':      ['zai'],
        'claude':   ['claude'],
        // LM Studio is an exclusive local mode handled by its own toggle, so it
        // maps to no cloud providers here.
        'lmstudio': [],
      };
      providers = legacyAliases[model] || [];
    }

    // 3. Apply State (Single Source of Truth)
    this.openaiEnabled = providers.includes('openai');
    this.geminiEnabled = providers.includes('gemini');
    this.zaiEnabled = providers.includes('zai');
    this.claudeEnabled = providers.includes('claude');
  }

  // Get enabled providers as array
  getEnabledProviders(): string[] {
    const providers: string[] = [];
    if (this.openaiEnabled) providers.push('openai');
    if (this.geminiEnabled) providers.push('gemini');
    if (this.zaiEnabled) providers.push('zai');
    if (this.claudeEnabled) providers.push('claude');
    return providers;
  }

  // Handle provider toggle
  onProviderToggle() {
    // Just update UI, actual save happens on Save button click
  }

  async loadOCRSettings() {
    const settings = await this.electronService.getOCRSettings();
    this.runInZone(() => {
      this.ocrEnabled = settings.enabled;
      this.ocrLanguage = settings.language;
    });
  }

  async loadAccumulatedTokenUsage() {
    try {
      const usage = await this.electronService.getAccumulatedTokenUsage();
      this.runInZone(() => {
        this.accumulatedTokenUsage = usage || {};
      });
    } catch (error) {
      console.error('Failed to load token usage statistics:', error);
    }
  }

  async resetUsageStats() {
    if (confirm('Are you sure you want to reset all token usage and cost statistics? This cannot be undone.')) {
      try {
        const result = await this.electronService.resetAccumulatedTokenUsage();
        if (result.success) {
          this.electronService.showToast('Usage statistics reset');
          await this.loadAccumulatedTokenUsage();
        } else {
          this.electronService.showToast(result.error || 'Failed to reset statistics');
        }
      } catch (error: any) {
        this.electronService.showToast(`Error: ${error.message}`);
      }
    }
  }

  hasUsageData(): boolean {
    if (!this.accumulatedTokenUsage) return false;
    return Object.values(this.accumulatedTokenUsage).some((provider: any) => provider && provider.totalTokens > 0);
  }

  getGrandTotalCost(): number {
    if (!this.accumulatedTokenUsage) return 0;
    return Object.values(this.accumulatedTokenUsage).reduce((acc: number, provider: any) => {
      return acc + (provider?.cost || 0);
    }, 0);
  }

  async saveOCRSettings() {
    const result = await this.electronService.saveOCRSettings({
      enabled: this.ocrEnabled,
      language: this.ocrLanguage,
    });
    if (result.success) {
      this.electronService.showToast('OCR settings saved');
    }
  }

  async saveVoiceProvider() {
    const result = await this.electronService.saveVoiceProvider(this.voiceProvider);
    if (result.success) {
      this.electronService.showToast(`Voice transcription: ${this.voiceProvider === 'openai' ? 'OpenAI Whisper' : 'Gemini'}`);
    } else {
      this.electronService.showToast(result.error || 'Failed to save voice setting');
    }
  }

  async saveVoiceScreenshotMode() {
    const result = await this.electronService.saveVoiceScreenshotMode(this.voiceScreenshotMode);
    if (result.success) {
      const label = this.voiceScreenshotMode === 'full' ? 'Full screen' :
                    this.voiceScreenshotMode === 'region' ? 'Region select' : 'No screenshot';
      this.electronService.showToast(`Voice auto-capture: ${label}`);
    } else {
      this.electronService.showToast(result.error || 'Failed to save screenshot setting');
    }
  }

  async saveAutoInteractionOnShow() {
    const result = await this.electronService.saveAutoInteractionOnShow(this.autoInteractionOnShow);
    if (result.success) {
      this.electronService.showToast(
        this.autoInteractionOnShow
          ? 'Auto-interaction on show: ON'
          : 'Auto-interaction on show: OFF'
      );
    } else {
      this.electronService.showToast(result.error || 'Failed to save window behavior setting');
    }
  }

  async saveNoteViewMode() {
    const result = await this.electronService.saveNoteViewMode(this.noteViewMode);
    if (result.success) {
      const label = this.noteViewMode === 'alongside'
        ? 'Alongside AI response'
        : 'Editor only';
      this.electronService.showToast(`Note view: ${label}`);
    } else {
      this.electronService.showToast(result.error || 'Failed to save note view setting');
    }
  }

  // OCR Test state
  ocrTestResult: { text: string; confidence: number } | null = null;
  ocrTestLoading: boolean = false;

  async testOCR() {
    this.loadingState['ocr'] = true;
    this.ocrTestResult = null;
    this.cdr.detectChanges();

    const result = await this.electronService.testOCR();
    
    this.runInZone(() => {
      this.loadingState['ocr'] = false;
      if (result.success && result.text) {
        this.ocrTestResult = {
          text: result.text,
          confidence: result.confidence || 0,
        };
        this.electronService.showToast(`OCR: ${result.confidence?.toFixed(0)}% confidence`);
      } else {
        this.electronService.showToast(result.error || 'OCR failed');
      }
    });
  }

  copyOCRText() {
    if (this.ocrTestResult?.text) {
      navigator.clipboard.writeText(this.ocrTestResult.text);
      this.electronService.showToast('Copied to clipboard');
    }
  }

  // LM Studio methods
  async onLMStudioToggle() {
    // When enabling LM Studio, auto-set it as default model
    if (this.lmstudioEnabled) {
      this.defaultModel = 'lmstudio';
      await this.electronService.saveDefaultModel('lmstudio');
      
      // Auto-enable OCR (LM Studio is text-only)
      if (!this.ocrEnabled) {
        this.ocrEnabled = true;
        await this.saveOCRSettings();
      }
      this.electronService.showToast('LM Studio enabled - OCR auto-activated');
    } else {
      // When disabling LM Studio, revert to 'both' as default
      this.defaultModel = 'both';
      await this.electronService.saveDefaultModel('both');
      this.electronService.showToast('LM Studio disabled - switched to cloud models');
    }
    
    await this.saveLMStudioSettings();
  }

  isOCRForcedByLMStudio(): boolean {
    return this.lmstudioEnabled && this.defaultModel === 'lmstudio';
  }

  async saveLMStudioSettings() {
    const result = await this.electronService.saveLMStudioSettings({
      enabled: this.lmstudioEnabled,
      endpoint: this.lmstudioEndpoint,
      model: this.lmstudioModel,
    });
    if (result.success) {
      this.electronService.showToast('LM Studio settings saved');
    } else {
      this.electronService.showToast(result.error || 'Failed to save LM Studio settings');
    }
  }

  // Unified test connection method replaces individual test methods
  // Use: testConnection('lmstudio'), testConnection('zai'), etc.

  async loadTemplates() {
    const templates = await this.electronService.getPromptTemplates();
    this.runInZone(() => {
      this.templates = templates;
      this.detectActiveTemplate();
    });
  }

  async loadDocuments() {
    const result = await this.electronService.listDocs();
    const docInfo = await this.electronService.getActiveDocInfo();
    
    this.runInZone(() => {
      if (result.success) {
        this.documents = result.docs;
      }
      this.activeDocInfo = docInfo;
    });
  }

  setupEventListeners() {
    this.electronService.onModelChanged().subscribe((model) => {
      this.defaultModel = model;
    });

    // Reload documents when they are updated (e.g., after import with key info)
    this.electronService.onDocumentsUpdated().subscribe(() => {
      this.loadDocuments();
    });

    // Listen for live token usage updates to keep dashboard synced if open
    this.electronService.onTokenUsageUpdated().subscribe((data) => {
      this.runInZone(() => {
        this.accumulatedTokenUsage = data.cumulative || {};
      });
    });
  }

  async saveApiKeys() {
    if (this.openaiApiKey.trim()) {
      await this.electronService.saveOpenAIApiKey(this.openaiApiKey.trim());
    }
    if (this.geminiApiKey.trim()) {
      await this.electronService.saveGeminiApiKey(this.geminiApiKey.trim());
    }
    if (this.zaiApiKey.trim()) {
      await this.electronService.saveZAIApiKey(this.zaiApiKey.trim());
    }
    if (this.claudeApiKey.trim()) {
      await this.electronService.saveClaudeApiKey(this.claudeApiKey.trim());
    }
    this.electronService.showToast('API Keys saved');
  }

  async saveModelSettings() {
    // Save enabled providers as JSON array
    const enabledProviders = this.getEnabledProviders();
    
    // Build parallel save tasks
    const saveTasks: Promise<any>[] = [
      this.electronService.saveDefaultModel(JSON.stringify(enabledProviders) as any)
    ];

    // Add provider-specific saves in parallel
    if (this.openaiEnabled) {
      saveTasks.push(this.electronService.saveOpenAIModel(this.openaiModel.trim() || 'gpt-5.2'));
    }
    if (this.geminiEnabled) {
      saveTasks.push(this.electronService.saveGeminiModel(this.geminiModel.trim() || 'gemini-3-flash-preview'));
    }
    if (this.claudeEnabled) {
      saveTasks.push(this.electronService.saveClaudeModel(this.claudeModel.trim() || 'claude-sonnet-4-6'));
    }
    if (this.zaiEnabled) {
      saveTasks.push(this.electronService.saveZAISettings({
        enabled: true,
        model: this.zaiModel.trim() || 'GLM-4.6V-Flash'
      }));
    }

    await Promise.all(saveTasks);
    this.electronService.showToast(`Model settings saved (${enabledProviders.join(', ')})`);
  }

  async savePreferences() {
    await this.electronService.savePreferences({
      preferredLanguage: this.preferredLanguage,
      answerStyle: this.answerStyle
    });
  }

  async saveSystemPrompt() {
    await this.electronService.saveCustomSystemPrompt(this.customSystemPrompt);
  }

  applyTemplate(template: SystemPromptTemplate) {
    this.customSystemPrompt = template.prompt;
    this.activeTemplateId = template.id;
    this.cdr.detectChanges();
  }

  getPromptCharCount(): number {
    return this.customSystemPrompt.length;
  }

  // Detect which template matches the current prompt
  detectActiveTemplate() {
    if (!this.customSystemPrompt) {
      this.activeTemplateId = null;
      return;
    }
    const matchingTemplate = this.templates.find(t => t.prompt === this.customSystemPrompt);
    this.activeTemplateId = matchingTemplate?.id || null;
  }

  isTemplateActive(template: SystemPromptTemplate): boolean {
    return this.activeTemplateId === template.id;
  }

  getActiveTemplateName(): string {
    if (!this.activeTemplateId) return '';
    const template = this.templates.find(t => t.id === this.activeTemplateId);
    return template?.name || 'Custom';
  }

  // Template Management
  openSaveTemplateDialog() {
    this.showSaveTemplateDialog = true;
    this.newTemplateName = '';
    this.editingTemplateId = null;
  }

  closeSaveTemplateDialog() {
    this.showSaveTemplateDialog = false;
    this.newTemplateName = '';
    this.editingTemplateId = null;
  }

  async saveAsTemplate() {
    if (!this.newTemplateName.trim() || !this.customSystemPrompt.trim()) {
      return;
    }

    const template = {
      id: this.editingTemplateId || Date.now().toString(),
      name: this.newTemplateName.trim(),
      prompt: this.customSystemPrompt
    };

    await this.electronService.savePromptTemplate(template);
    await this.loadTemplates();
    this.closeSaveTemplateDialog();
  }

  editTemplate(template: SystemPromptTemplate, event: Event) {
    event.stopPropagation();
    
    this.customSystemPrompt = template.prompt;
    this.newTemplateName = template.name;
    this.editingTemplateId = template.id;
    this.showSaveTemplateDialog = true;
  }

  async deleteTemplate(template: SystemPromptTemplate, event: Event) {
    event.stopPropagation();
    
    await this.electronService.deletePromptTemplate(template.id);
    await this.loadTemplates();
    
    // If deleted template was active, clear the prompt
    if (this.customSystemPrompt === template.prompt) {
      this.customSystemPrompt = '';
      await this.saveSystemPrompt();
    }
  }

  async resetTemplates() {
    if (confirm('Reset all templates to defaults? Your custom templates will be removed.')) {
      await this.electronService.resetPromptTemplates();
      await this.loadTemplates();
      this.runInZone(() => {
        this.customSystemPrompt = '';
        this.activeTemplateId = null;
      });
      await this.saveSystemPrompt();
    }
  }

  async importDocument() {
    try {
      const picked = await this.electronService.openFileDialog();
      if (picked.canceled || !picked.filePath) return;
      
      // Use the new import with key info extraction
      const result = await this.electronService.importDocumentWithKeyInfo(picked.filePath);
      if (!result.success) {
        console.error('Error importing document:', result.error);
      }
      await this.loadDocuments();
    } catch (error: any) {
      console.error('Error importing document:', error);
    }
  }

  // Button click handlers with proper event handling
  onViewClick(event: Event, filePath: string) {
    event.stopPropagation();
    event.preventDefault();
    this.viewKeyInfo(filePath);
  }

  onToggleActiveClick(event: Event, doc: any) {
    event.stopPropagation();
    event.preventDefault();
    if (doc.active) {
      this.clearActiveDoc();
    } else {
      this.setActiveDoc(doc.filePath);
    }
  }

  onRemoveClick(event: Event, filePath: string) {
    event.stopPropagation();
    event.preventDefault();
    this.removeDoc(filePath);
  }

  async setActiveDoc(filePath: string) {
    await this.electronService.setActiveDoc(filePath);
    await this.loadDocuments();
  }

  async removeDoc(filePath: string) {
    await this.electronService.removeDoc(filePath);
    await this.loadDocuments();
  }

  async clearActiveDoc() {
    await this.electronService.clearActiveDocContext();
    await this.loadDocuments();
  }

  // Key Info Modal methods
  async viewKeyInfo(filePath: string) {
    // Guard: don't open if modal already showing
    if (this.showKeyInfoModal) return;
    
    try {
      const result = await this.electronService.getDocKeyInfo(filePath);
      this.runInZone(() => {
        if (result.success && result.hasKeyInfo) {
          this.keyInfoData = { ...result, filePath };
          this.currentKeyInfoFilePath = filePath;
          this.showKeyInfoModal = true;
          this.isEditingKeyInfo = false;
        } else if (!result.success) {
          console.error('Error loading key info:', result.error);
        }
      });
    } catch (error) {
      console.error('Error viewing key info:', error);
    }
  }

  closeKeyInfoModal() {
    this.showKeyInfoModal = false;
    this.keyInfoData = null;
    this.isEditingKeyInfo = false;
    this.editedKeyInfo = '';
    this.currentKeyInfoFilePath = '';
  }

  copyKeyInfo() {
    if (this.keyInfoData?.keyInfo) {
      navigator.clipboard.writeText(this.keyInfoData.keyInfo);
      this.electronService.showToast('Key info copied to clipboard');
    }
  }

  toggleEditKeyInfo() {
    if (!this.isEditingKeyInfo) {
      // Enter edit mode
      this.editedKeyInfo = this.keyInfoData?.keyInfo || '';
      this.isEditingKeyInfo = true;
    } else {
      // Cancel edit mode
      this.isEditingKeyInfo = false;
      this.editedKeyInfo = '';
    }
    this.cdr.detectChanges();
  }

  async saveKeyInfoEdit() {
    if (!this.currentKeyInfoFilePath) return;
    
    try {
      const result = await this.electronService.saveDocKeyInfo(this.currentKeyInfoFilePath, this.editedKeyInfo);
      this.runInZone(() => {
        if (result.success) {
          // Update local data
          if (this.keyInfoData) {
            this.keyInfoData.keyInfo = this.editedKeyInfo;
            this.keyInfoData.keyInfoLength = result.keyInfoLength;
          }
          this.isEditingKeyInfo = false;
          this.electronService.showToast('Key info saved');
        } else {
          console.error('Error saving key info:', result.error);
          this.electronService.showToast('Failed to save key info');
        }
      });
    } catch (error) {
      console.error('Error saving key info:', error);
    }
  }

  cancelKeyInfoEdit() {
    this.isEditingKeyInfo = false;
    this.editedKeyInfo = '';
    this.cdr.detectChanges();
  }

  // Rename Document methods
  openRenameDialog(doc: any, event: Event) {
    event.stopPropagation();
    event.preventDefault();
    this.renameDocPath = doc.filePath;
    this.renameNewName = doc.fileName;
    this.showRenameDialog = true;
  }

  closeRenameDialog() {
    this.showRenameDialog = false;
    this.renameDocPath = '';
    this.renameNewName = '';
  }

  async saveRename() {
    if (!this.renameDocPath || !this.renameNewName.trim()) return;
    
    try {
      const result = await this.electronService.renameDoc(this.renameDocPath, this.renameNewName.trim());
      if (result.success) {
        this.electronService.showToast('Document renamed');
        await this.loadDocuments();
      } else {
        this.electronService.showToast(result.error || 'Failed to rename');
      }
    } catch (error) {
      console.error('Error renaming document:', error);
    }
    this.closeRenameDialog();
  }
}
