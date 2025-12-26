import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { AppComponent } from './app.component';
import { PromptTabComponent } from './components/prompt-tab/prompt-tab.component';
import { HistoryTabComponent } from './components/history-tab/history-tab.component';
import { SettingsTabComponent } from './components/settings-tab/settings-tab.component';
import { ShortcutsTabComponent } from './components/shortcuts-tab/shortcuts-tab.component';
import { ElectronService } from './services/electron.service';
import { MarkdownService } from './services/markdown.service';
import { ToastComponent } from './components/toast/toast.component';

@NgModule({
  declarations: [
    AppComponent,
    PromptTabComponent,
    HistoryTabComponent,
    SettingsTabComponent,
    ShortcutsTabComponent,
    ToastComponent
  ],
  imports: [
    BrowserModule,
    FormsModule
  ],
  providers: [
    ElectronService,
    MarkdownService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

