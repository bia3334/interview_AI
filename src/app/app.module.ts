import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AppComponent } from './app.component';
import { PromptTabComponent } from './components/prompt-tab/prompt-tab.component';
import { HistoryTabComponent } from './components/history-tab/history-tab.component';
import { SettingsTabComponent } from './components/settings-tab/settings-tab.component';
import { ShortcutsTabComponent } from './components/shortcuts-tab/shortcuts-tab.component';
import { ModeSelectComponent } from './components/mode-select/mode-select.component';
import { InterviewComponent } from './components/interview/interview.component';
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
    ModeSelectComponent,
    InterviewComponent,
    ToastComponent
  ],
  imports: [
    BrowserModule,
    FormsModule,
    MatIconModule
  ],
  providers: [
    ElectronService,
    MarkdownService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }

