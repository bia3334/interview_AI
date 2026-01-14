import { Component, OnInit } from '@angular/core';
import { ElectronService } from './services/electron.service';
import { HistoryItem } from './components/history-tab/history-tab.component';
import { TABS, DEFAULT_TAB, TAB, TabConfig, TabId } from './constants/tabs';

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

