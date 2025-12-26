import { Component, OnInit } from '@angular/core';
import { ElectronService } from '../../services/electron.service';

@Component({
  selector: 'app-settings-tab',
  templateUrl: './settings-tab.component.html',
  styleUrls: ['./settings-tab.component.css'],
  standalone: false
})
export class SettingsTabComponent implements OnInit {
  openaiApiKey: string = '';
  geminiApiKey: string = '';
  preferredLanguage: string = 'python';
  defaultModel: 'openai' | 'gemini' | 'both' = 'both';
  answerStyle: 'code' | 'explanation' | 'multiple-choice' = 'explanation';
  
  // Documents
  activeDocInfo: { hasContext: boolean; fileName?: string; length?: number } = { hasContext: false };
  documents: Array<{ filePath: string; fileName: string; length: number; addedAt: number; active: boolean }> = [];

  constructor(private electronService: ElectronService) {}

  ngOnInit() {
    this.loadSettings();
    this.loadDocuments();
    this.setupEventListeners();
  }

  async loadSettings() {
    const [openaiKey, geminiKey, preferences, defaultModel] = await Promise.all([
      this.electronService.getOpenAIApiKey(),
      this.electronService.getGeminiApiKey(),
      this.electronService.getPreferences(),
      this.electronService.getDefaultModel()
    ]);

    this.openaiApiKey = openaiKey || '';
    this.geminiApiKey = geminiKey || '';
    this.preferredLanguage = preferences.preferredLanguage || 'python';
    this.answerStyle = (preferences.answerStyle as any) || 'explanation';
    this.defaultModel = defaultModel;
  }

  async loadDocuments() {
    const result = await this.electronService.listDocs();
    if (result.success) {
      this.documents = result.docs;
    }
    
    const docInfo = await this.electronService.getActiveDocInfo();
    this.activeDocInfo = docInfo;
  }

  setupEventListeners() {
    this.electronService.onAnswerStyleChanged().subscribe((style) => {
      this.answerStyle = style as any;
    });

    this.electronService.onModelChanged().subscribe((model) => {
      this.defaultModel = model;
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

  async importDocument() {
    try {
      const picked = await this.electronService.openFileDialog();
      if (picked.canceled || !picked.filePath) return;
      
      await this.electronService.askAboutFileWithOpenAI(picked.filePath, '');
      await this.loadDocuments();
    } catch (error: any) {
      console.error('Error importing document:', error);
    }
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
}

