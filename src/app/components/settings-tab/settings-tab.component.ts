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
  keyInfoData: { fileName?: string; keyInfo?: string; hasKeyInfo?: boolean; contentLength?: number; keyInfoLength?: number } | null = null;

  // Template management
  showSaveTemplateDialog: boolean = false;
  newTemplateName: string = '';
  editingTemplateId: string | null = null;

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

  switchSubTab(tab: 'api' | 'behavior') {
    this.activeSubTab = tab;
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
  }

  async loadTemplates() {
    this.templates = await this.electronService.getPromptTemplates();
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
  }

  getPromptCharCount(): number {
    return this.customSystemPrompt.length;
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
      this.customSystemPrompt = '';
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
          this.keyInfoData = result;
          this.showKeyInfoModal = true;
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
  }

  copyKeyInfo() {
    if (this.keyInfoData?.keyInfo) {
      navigator.clipboard.writeText(this.keyInfoData.keyInfo);
      this.electronService.showToast('Key info copied to clipboard');
    }
  }
}
