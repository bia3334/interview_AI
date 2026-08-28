import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ElectronService } from './services/electron.service';
import { HistoryItem } from './components/history-tab/history-tab.component';
import { TABS, DEFAULT_TAB, TAB, TabConfig, TabId } from './constants/tabs';
import { APP_MODE, AppMode } from './constants/app-mode';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: false
})
export class AppComponent implements OnInit {
  activeTab: TabId = DEFAULT_TAB;
  continuedItem: HistoryItem | null = null;
  tabs: TabConfig[] = TABS;
  TAB = TAB; // Expose to template
  APP_MODE = APP_MODE;

  /** Active mode; null shows the launch picker. */
  mode: AppMode | null = null;
  /** Last mode used (preselects the picker). */
  lastMode: AppMode | null = null;
  /** Prevents the picker flashing before the stored mode has been read. */
  modeLoaded = false;

  constructor(private electronService: ElectronService, private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    console.log('AppComponent: Initialized');
    try {
      this.lastMode = await this.electronService.getAppMode();
    } catch {
      this.lastMode = null;
    }
    // Picker is showing: make sure the window accepts clicks.
    await this.electronService.setAppMode(null);
    this.modeLoaded = true;
    this.cdr.detectChanges();
  }

  async selectMode(mode: AppMode) {
    await this.electronService.setAppMode(mode);
    this.mode = mode;
    this.lastMode = mode;
    this.activeTab = DEFAULT_TAB;
    this.applyBodyClass();
    this.cdr.detectChanges();
  }

  async switchMode() {
    this.mode = null;
    this.applyBodyClass();
    await this.electronService.setAppMode(null);
    this.cdr.detectChanges();
  }

  private applyBodyClass() {
    document.body.classList.toggle('mode-interview', this.mode === APP_MODE.INTERVIEW);
  }

  switchTab(tabName: TabId) {
    this.activeTab = tabName;
  }

  onContinueItem(item: HistoryItem) {
    this.continuedItem = item;
    this.activeTab = TAB.PROMPT;
  }

  onItemLoaded() {
    // Defer clearing to avoid ExpressionChangedAfterItHasBeenCheckedError
    setTimeout(() => {
      this.continuedItem = null;
    });
  }

  hideWindow() {
    this.electronService.hideWindow();
  }

  closeWindow() {
    this.electronService.closeWindow();
  }
}
