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
  lmstudioResponse?: string;
  zaiResponse?: string;
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

  @Output() continueItem = new EventEmitter<HistoryItem>();

  @ViewChild('openaiResponseContent') openaiResponseContent!: ElementRef;
  @ViewChild('geminiResponseContent') geminiResponseContent!: ElementRef;
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
}
