import { Component, OnInit } from '@angular/core';
import { ElectronService } from './services/electron.service';
import { HistoryItem } from './components/history-tab/history-tab.component';
import { TABS, TAB_IDS, DEFAULT_TAB, TAB, TabConfig, TabId } from './constants/tabs';

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

  constructor(private electronService: ElectronService) {}

  ngOnInit() {
    console.log('AppComponent: Initialized');
    // Subscribe to tab switching events from main process
    this.electronService.onSwitchTab().subscribe((direction: string) => {
      const currentIndex = TAB_IDS.indexOf(this.activeTab as TabId);
      let nextIndex: number;
      
      if (direction === 'previous') {
        nextIndex = (currentIndex - 1 + TAB_IDS.length) % TAB_IDS.length;
      } else {
        nextIndex = (currentIndex + 1) % TAB_IDS.length;
      }
      
      this.activeTab = TAB_IDS[nextIndex] as TabId;
    });
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

