import { Component, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { ElectronService } from '../../services/electron.service';

interface SystemPromptTemplate {
  id: string;
  name: string;
  prompt: string;
}

@Component({
  selector: 'app-settings-tab',
  templateUrl: './settings-tab.component.html',
  styleUrls: ['./settings-tab.component.css'],
  standalone: false
})
export class SettingsTabComponent implements OnInit {
  // Sub-tab state
  activeSubTab: 'api' | 'behavior' = 'api';

  // API & Models
  openaiApiKey: string = '';
  geminiApiKey: string = '';
  defaultModel: 'openai' | 'gemini' | 'both' = 'both';

  // AI Behavior
  preferredLanguage: string = 'python';
  answerStyle: 'code' | 'explanation' | 'multiple-choice' = 'explanation';
  customSystemPrompt: string = '';
  
  // Documents
  activeDocInfo: { hasContext: boolean; fileName?: string; length?: number; hasKeyInfo?: boolean } = { hasContext: false };
  documents: Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean; hasKeyInfo?: boolean; keyInfoLength?: number }> = [];

  // Key Info Modal
  showKeyInfoModal: boolean = false;
  keyInfoData: { fileName?: string; keyInfo?: string; hasKeyInfo?: boolean; contentLength?: number; keyInfoLength?: number; filePath?: string } | null = null;
  isEditingKeyInfo: boolean = false;
  editedKeyInfo: string = '';
  currentKeyInfoFilePath: string = '';

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

  ngOnInit() {
    this.loadSettings();
    this.loadDocuments();
    this.loadTemplates();
    this.setupEventListeners();
  }

  async switchSubTab(tab: 'api' | 'behavior') {
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
    }
  }

  async loadSettings() {
    const [openaiKey, geminiKey, preferences, defaultModel, customPrompt] = await Promise.all([
      this.electronService.getOpenAIApiKey(),
      this.electronService.getGeminiApiKey(),
      this.electronService.getPreferences(),
      this.electronService.getDefaultModel(),
      this.electronService.getCustomSystemPrompt()
    ]);

    this.openaiApiKey = openaiKey || '';
    this.geminiApiKey = geminiKey || '';
    this.preferredLanguage = preferences.preferredLanguage || 'python';
    this.answerStyle = (preferences.answerStyle as any) || 'explanation';
    this.defaultModel = defaultModel;
    this.customSystemPrompt = customPrompt || '';
    this.detectActiveTemplate();
  }

  async loadTemplates() {
    const templates = await this.electronService.getPromptTemplates();
    this.ngZone.run(() => {
      this.templates = templates;
      this.detectActiveTemplate();
      this.cdr.detectChanges();
    });
  }

  async loadDocuments() {
    const result = await this.electronService.listDocs();
    const docInfo = await this.electronService.getActiveDocInfo();
    
    this.ngZone.run(() => {
      if (result.success) {
        this.documents = result.docs;
      }
      this.activeDocInfo = docInfo;
      this.cdr.detectChanges();
    });
  }

  setupEventListeners() {
    this.electronService.onAnswerStyleChanged().subscribe((style) => {
      this.answerStyle = style as any;
    });

    this.electronService.onModelChanged().subscribe((model) => {
      this.defaultModel = model;
    });

    // Reload documents when they are updated (e.g., after import with key info)
    this.electronService.onDocumentsUpdated().subscribe(() => {
      this.loadDocuments();
    });
  }

  async saveApiKeys() {
    if (this.openaiApiKey.trim()) {
      await this.electronService.saveOpenAIApiKey(this.openaiApiKey.trim());
    }
    if (this.geminiApiKey.trim()) {
      await this.electronService.saveGeminiApiKey(this.geminiApiKey.trim());
    }
  }

  async savePreferences() {
    await this.electronService.savePreferences({
      preferredLanguage: this.preferredLanguage,
      answerStyle: this.answerStyle
    });
    await this.electronService.saveDefaultModel(this.defaultModel);
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
      this.ngZone.run(() => {
        this.customSystemPrompt = '';
        this.activeTemplateId = null;
        this.cdr.detectChanges();
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
      this.ngZone.run(() => {
        if (result.success && result.hasKeyInfo) {
          this.keyInfoData = { ...result, filePath };
          this.currentKeyInfoFilePath = filePath;
          this.showKeyInfoModal = true;
          this.isEditingKeyInfo = false;
        } else if (!result.success) {
          console.error('Error loading key info:', result.error);
        }
        this.cdr.detectChanges();
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
      this.ngZone.run(() => {
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
        this.cdr.detectChanges();
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
}
