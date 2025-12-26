import { Component, OnInit } from '@angular/core';
import { ElectronService } from './services/electron.service';
import { HistoryItem } from './components/history-tab/history-tab.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: false
})
export class AppComponent implements OnInit {
  activeTab: string = 'prompt';
  continuedItem: HistoryItem | null = null;

  constructor(private electronService: ElectronService) {}

  ngOnInit() {
    console.log('AppComponent: Initialized');
    // Subscribe to tab switching events from main process
    this.electronService.onSwitchTab().subscribe((direction: string) => {
      const tabs = ['prompt', 'history', 'settings', 'shortcuts'];
      const currentIndex = tabs.indexOf(this.activeTab);
      let nextIndex: number;
      
      if (direction === 'previous') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      } else {
        nextIndex = (currentIndex + 1) % tabs.length;
      }
      
      this.activeTab = tabs[nextIndex];
    });
  }

  switchTab(tabName: string) {
    this.activeTab = tabName;
  }

  onContinueItem(item: HistoryItem) {
    this.continuedItem = item;
    this.activeTab = 'prompt';
  }

  hideWindow() {
    this.electronService.hideWindow();
  }

  closeWindow() {
    this.electronService.closeWindow();
  }
}

