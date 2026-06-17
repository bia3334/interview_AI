import { Component, OnInit, ChangeDetectorRef, NgZone, Output, EventEmitter, AfterViewChecked, ViewChild, ElementRef } from '@angular/core';
import { ElectronService } from '../../services/electron.service';
import { MarkdownService } from '../../services/markdown.service';

export interface HistoryItem {
  id: string;
  timestamp: Date;
  prompt: string;
  screenshotCount: number;
  openaiResponse?: string;
  geminiResponse?: string;
  claudeResponse?: string;
  lmstudioResponse?: string;
  zaiResponse?: string;
  starred?: boolean;
  tags?: string[];
}

@Component({
  selector: 'app-history-tab',
  templateUrl: './history-tab.component.html',
  styleUrls: ['./history-tab.component.css'],
  standalone: false
})
export class HistoryTabComponent implements OnInit, AfterViewChecked {
  history: HistoryItem[] = [];
  selectedItem: HistoryItem | null = null;

  // Search & Filter state
  searchQuery: string = '';
  selectedProvider: string = 'all';
  selectedDateRange: string = 'all';
  starredOnly: boolean = false;
  selectedTag: string = 'all';
  newTagInput: string = '';

  @Output() continueItem = new EventEmitter<HistoryItem>();

  @ViewChild('openaiResponseContent') openaiResponseContent!: ElementRef;
  @ViewChild('geminiResponseContent') geminiResponseContent!: ElementRef;
  @ViewChild('claudeResponseContent') claudeResponseContent!: ElementRef;
  @ViewChild('lmstudioResponseContent') lmstudioResponseContent!: ElementRef;
  @ViewChild('zaiResponseContent') zaiResponseContent!: ElementRef;

  constructor(
    private electronService: ElectronService,
    private markdownService: MarkdownService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.loadHistory();
    this.setupEventListeners();
  }

  ngAfterViewChecked() {
    this.renderMarkdownTargets();
  }

  /** Run KaTeX auto-render over each response container. Idempotent. */
  private renderMarkdownTargets() {
    const targets = [
      this.openaiResponseContent,
      this.geminiResponseContent,
      this.claudeResponseContent,
      this.lmstudioResponseContent,
      this.zaiResponseContent,
    ];
    for (const ref of targets) {
      if (ref?.nativeElement) {
        this.markdownService.renderMathInElement(ref.nativeElement);
      }
    }
  }

  /**
   * Render on the next macrotask. The detail containers are behind *ngIf, so
   * their @ViewChild refs aren't resolved during the change-detection pass that
   * sets selectedItem — deferring ensures the DOM exists before we render
   * (otherwise math only appeared after switching tabs and back).
   */
  private scheduleMarkdownRender() {
    setTimeout(() => this.renderMarkdownTargets());
  }

  async loadHistory() {
    try {
      const stored = await this.electronService.getHistory();
      this.ngZone.run(() => {
        this.history = stored || [];
        this.cdr.detectChanges();
      });
    } catch (error) {
      console.error('Error loading history:', error);
      this.ngZone.run(() => {
        this.history = [];
        this.cdr.detectChanges();
      });
    }
  }

  setupEventListeners() {
    // Listen for new history items
    this.electronService.onHistoryUpdated().subscribe(() => {
      this.loadHistory();
    });
  }

  selectItem(item: HistoryItem) {
    this.selectedItem = item;
    this.scheduleMarkdownRender();
  }

  closeDetail() {
    this.selectedItem = null;
  }

  async deleteItem(item: HistoryItem, event: Event) {
    event.stopPropagation();
    await this.electronService.deleteHistoryItem(item.id);
    if (this.selectedItem?.id === item.id) {
      this.selectedItem = null;
    }
    await this.loadHistory();
  }

  async clearAllHistory() {
    if (this.history.length === 0) return;
    await this.electronService.clearHistory();
    this.history = [];
    this.selectedItem = null;
  }

  formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString();
  }

  truncateText(text: string, maxLength: number = 100): string {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.electronService.showToast('Copied to clipboard!');
    });
  }

  continueSession(item: HistoryItem) {
    // Emit event to parent to switch to prompt tab and load this item
    this.continueItem.emit(item);
  }

  get allTags(): string[] {
    const tagsSet = new Set<string>();
    this.history.forEach(item => {
      if (item.tags) {
        item.tags.forEach(t => tagsSet.add(t));
      }
    });
    return Array.from(tagsSet).sort();
  }

  filterByDate(itemDate: Date | string, range: string): boolean {
    if (range === 'all') return true;
    const date = new Date(itemDate);
    const now = new Date();
    
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const itemDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffTime = today.getTime() - itemDay.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (range === 'today') {
      return itemDay.getTime() === today.getTime();
    } else if (range === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return itemDay.getTime() === yesterday.getTime();
    } else if (range === 'week') {
      return diffDays <= 7;
    } else if (range === 'month') {
      return diffDays <= 30;
    }
    return true;
  }

  get filteredHistory(): HistoryItem[] {
    return this.history.filter(item => {
      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase();
        const matchesPrompt = item.prompt?.toLowerCase().includes(query);
        const matchesOpenAI = item.openaiResponse?.toLowerCase().includes(query);
        const matchesGemini = item.geminiResponse?.toLowerCase().includes(query);
        const matchesClaude = item.claudeResponse?.toLowerCase().includes(query);
        const matchesLMStudio = item.lmstudioResponse?.toLowerCase().includes(query);
        const matchesZAI = item.zaiResponse?.toLowerCase().includes(query);
        
        if (!matchesPrompt && !matchesOpenAI && !matchesGemini && !matchesClaude && !matchesLMStudio && !matchesZAI) {
          return false;
        }
      }
      
      if (this.selectedProvider !== 'all') {
        if (this.selectedProvider === 'openai' && !item.openaiResponse) return false;
        if (this.selectedProvider === 'gemini' && !item.geminiResponse) return false;
        if (this.selectedProvider === 'claude' && !item.claudeResponse) return false;
        if (this.selectedProvider === 'lmstudio' && !item.lmstudioResponse) return false;
        if (this.selectedProvider === 'zai' && !item.zaiResponse) return false;
      }
      
      if (!this.filterByDate(item.timestamp, this.selectedDateRange)) {
        return false;
      }
      
      if (this.starredOnly && !item.starred) {
        return false;
      }
      
      if (this.selectedTag !== 'all') {
        if (!item.tags || !item.tags.includes(this.selectedTag)) {
          return false;
        }
      }
      
      return true;
    });
  }

  clearFilters() {
    this.searchQuery = '';
    this.selectedProvider = 'all';
    this.selectedDateRange = 'all';
    this.starredOnly = false;
    this.selectedTag = 'all';
  }

  async toggleStar(item: HistoryItem, event: Event) {
    event.stopPropagation();
    item.starred = !item.starred;
    await this.electronService.updateHistoryItem(item);
    await this.loadHistory();
  }

  async addTag(item: HistoryItem) {
    if (!this.newTagInput.trim()) return;
    const tag = this.newTagInput.trim().toLowerCase();
    
    if (!item.tags) {
      item.tags = [];
    }
    
    if (!item.tags.includes(tag)) {
      item.tags.push(tag);
      await this.electronService.updateHistoryItem(item);
      await this.loadHistory();
    }
    this.newTagInput = '';
  }

  async removeTag(item: HistoryItem, tag: string) {
    if (!item.tags) return;
    item.tags = item.tags.filter(t => t !== tag);
    await this.electronService.updateHistoryItem(item);
    await this.loadHistory();
  }

  htmlToMarkdown(html: string): string {
    if (!html) return '';
    let text = html;
    text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    text = text.replace(/<pre><code class="language-([^"]*)">([\s\S]*?)<\/code><\/pre>/gi, '```$1\n$2\n```\n\n');
    text = text.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
    text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    text = text.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, '$1\n');
    text = text.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, '$1\n');
    text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');
    text = text.replace(/<[^>]+>/g, '');
    const tempEl = document.createElement('textarea');
    tempEl.innerHTML = text;
    return tempEl.value;
  }

  downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  exportSingleJSON(item: HistoryItem) {
    const dataStr = JSON.stringify(item, null, 2);
    const dateStr = new Date(item.timestamp).toISOString().split('T')[0];
    this.downloadFile(dataStr, `qa-history-${dateStr}-${item.id.substring(0, 5)}.json`, 'application/json');
    this.electronService.showToast('JSON Exported!');
  }

  exportSingleMarkdown(item: HistoryItem) {
    let md = `# Q&A History Item\n\n`;
    md += `**Date:** ${this.formatDate(item.timestamp)}\n`;
    md += `**Screenshots:** ${item.screenshotCount}\n`;
    if (item.starred) md += `**Starred:** Yes\n`;
    if (item.tags && item.tags.length > 0) md += `**Tags:** ${item.tags.map(t => '#' + t).join(', ')}\n`;
    md += `\n## Question\n\n${item.prompt || '(Screenshot analysis)'}\n\n`;
    
    if (item.openaiResponse) {
      md += `## OpenAI Response\n\n${this.htmlToMarkdown(item.openaiResponse)}\n\n`;
    }
    if (item.geminiResponse) {
      md += `## Gemini Response\n\n${this.htmlToMarkdown(item.geminiResponse)}\n\n`;
    }
    if (item.claudeResponse) {
      md += `## Claude Response\n\n${this.htmlToMarkdown(item.claudeResponse)}\n\n`;
    }
    if (item.lmstudioResponse) {
      md += `## LM Studio Response\n\n${this.htmlToMarkdown(item.lmstudioResponse)}\n\n`;
    }
    if (item.zaiResponse) {
      md += `## Z.AI Response\n\n${this.htmlToMarkdown(item.zaiResponse)}\n\n`;
    }
    
    const dateStr = new Date(item.timestamp).toISOString().split('T')[0];
    this.downloadFile(md, `qa-history-${dateStr}-${item.id.substring(0, 5)}.md`, 'text/markdown');
    this.electronService.showToast('Markdown Exported!');
  }

  exportFilteredMarkdown() {
    const items = this.filteredHistory;
    if (items.length === 0) return;
    
    let md = `# Exported Q&A History\n\n`;
    md += `Generated on: ${new Date().toLocaleString()}\n`;
    md += `Total Items: ${items.length}\n\n`;
    md += `---\n\n`;
    
    items.forEach((item, index) => {
      md += `## Q&A #${index + 1}\n\n`;
      md += `**Date:** ${this.formatDate(item.timestamp)}\n`;
      md += `**Screenshots:** ${item.screenshotCount}\n`;
      if (item.starred) md += `**Starred:** Yes\n`;
      if (item.tags && item.tags.length > 0) md += `**Tags:** ${item.tags.map(t => '#' + t).join(', ')}\n`;
      md += `\n### Question / Prompt\n\n${item.prompt || '(Screenshot analysis)'}\n\n`;
      
      if (item.openaiResponse) {
        md += `### OpenAI Response\n\n${this.htmlToMarkdown(item.openaiResponse)}\n\n`;
      }
      if (item.geminiResponse) {
        md += `### Gemini Response\n\n${this.htmlToMarkdown(item.geminiResponse)}\n\n`;
      }
      if (item.claudeResponse) {
        md += `### Claude Response\n\n${this.htmlToMarkdown(item.claudeResponse)}\n\n`;
      }
      if (item.lmstudioResponse) {
        md += `### LM Studio Response\n\n${this.htmlToMarkdown(item.lmstudioResponse)}\n\n`;
      }
      if (item.zaiResponse) {
        md += `### Z.AI Response\n\n${this.htmlToMarkdown(item.zaiResponse)}\n\n`;
      }
      md += `---\n\n`;
    });
    
    const dateStr = new Date().toISOString().split('T')[0];
    this.downloadFile(md, `qa-history-export-${dateStr}.md`, 'text/markdown');
    this.electronService.showToast(`Exported ${items.length} items to Markdown!`);
  }

  exportFilteredJSON() {
    const items = this.filteredHistory;
    if (items.length === 0) return;
    
    const dataStr = JSON.stringify(items, null, 2);
    const dateStr = new Date().toISOString().split('T')[0];
    this.downloadFile(dataStr, `qa-history-export-${dateStr}.json`, 'application/json');
    this.electronService.showToast(`Exported ${items.length} items to JSON!`);
  }
}
