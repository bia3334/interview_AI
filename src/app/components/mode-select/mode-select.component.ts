import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { APP_MODE_OPTIONS, AppMode, AppModeOption } from '../../constants/app-mode';

/**
 * Launch screen: pick Exam (stealth overlay) or Interview (live answers).
 * Keyboard: 1 / 2 or ←/→ + Enter. The last-used mode is preselected.
 */
@Component({
  selector: 'app-mode-select',
  templateUrl: './mode-select.component.html',
  styleUrls: ['./mode-select.component.css'],
  standalone: false
})
export class ModeSelectComponent {
  @Input() set lastMode(value: AppMode | null) {
    if (value) this.focused = value;
  }
  @Output() modeSelected = new EventEmitter<AppMode>();

  options: AppModeOption[] = APP_MODE_OPTIONS;
  focused: AppMode = APP_MODE_OPTIONS[0].id;

  select(mode: AppMode) {
    this.focused = mode;
    this.modeSelected.emit(mode);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    const index = this.options.findIndex(o => o.id === this.focused);
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        this.focused = this.options[Math.max(0, index - 1)].id;
        event.preventDefault();
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        this.focused = this.options[Math.min(this.options.length - 1, index + 1)].id;
        event.preventDefault();
        break;
      case 'Enter':
        this.select(this.focused);
        event.preventDefault();
        break;
      default: {
        const byHotkey = this.options.find(o => o.hotkey === event.key);
        if (byHotkey) {
          this.select(byHotkey.id);
          event.preventDefault();
        }
      }
    }
  }
}
