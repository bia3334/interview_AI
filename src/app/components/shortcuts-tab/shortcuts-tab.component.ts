import { Component, HostListener, OnInit } from '@angular/core';
import { ElectronService } from '../../services/electron.service';
import { ShortcutBinding } from '../../../preload/types';

/** Keys that are modifiers only — ignored while waiting for the "real" key. */
const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'AltGraph']);

@Component({
  selector: 'app-shortcuts-tab',
  templateUrl: './shortcuts-tab.component.html',
  styleUrls: ['./shortcuts-tab.component.css'],
  standalone: false
})
export class ShortcutsTabComponent implements OnInit {
  shortcuts: ShortcutBinding[] = [];
  /** id of the shortcut currently being rebound, or null when idle. */
  capturingId: string | null = null;
  loading = true;

  constructor(private electronService: ElectronService) {}

  ngOnInit(): void {
    this.loadShortcuts();
  }

  private async loadShortcuts(): Promise<void> {
    this.loading = true;
    const res = await this.electronService.getShortcuts();
    if (res.success && res.shortcuts) {
      this.shortcuts = res.shortcuts;
    }
    this.loading = false;
  }

  /** Split an accelerator string into friendly chips for display. */
  keysFor(accelerator: string): string[] {
    return accelerator.split('+').map(token => {
      switch (token) {
        case 'CommandOrControl':
        case 'CmdOrCtrl':
          return 'Ctrl/Cmd';
        case 'Control':
          return 'Ctrl';
        case 'Command':
        case 'Cmd':
          return 'Cmd';
        case 'Return':
          return 'Enter';
        default:
          return token;
      }
    });
  }

  isCustom(s: ShortcutBinding): boolean {
    return s.accelerator !== s.defaultAccelerator;
  }

  async startCapture(id: string): Promise<void> {
    if (this.capturingId === id) return;
    this.capturingId = id;
    // Suspend global shortcuts so the next keystroke reaches us instead of
    // firing its bound action system-wide.
    await this.electronService.setShortcutCapture(true);
  }

  async cancelCapture(): Promise<void> {
    if (!this.capturingId) return;
    this.capturingId = null;
    await this.electronService.setShortcutCapture(false);
  }

  @HostListener('document:keydown', ['$event'])
  async onKeyDown(event: KeyboardEvent): Promise<void> {
    if (!this.capturingId) return;

    event.preventDefault();
    event.stopPropagation();

    // Escape cancels the rebind without changing anything.
    if (event.key === 'Escape') {
      await this.cancelCapture();
      return;
    }

    // Wait until a non-modifier key is pressed alongside the modifiers.
    if (MODIFIER_KEYS.has(event.key)) return;

    const accelerator = this.buildAccelerator(event);
    if (!accelerator) return;

    const id = this.capturingId;
    this.capturingId = null;

    const res = await this.electronService.saveShortcut(id, accelerator);
    // Whether it succeeded or not, restore global shortcuts.
    await this.electronService.setShortcutCapture(false);

    if (res.success && res.shortcuts) {
      this.shortcuts = res.shortcuts;
      this.electronService.showToast('Shortcut updated');
    } else {
      this.electronService.showToast(res.error || 'Could not set shortcut');
    }
  }

  /** Translate a KeyboardEvent into an Electron accelerator string. */
  private buildAccelerator(event: KeyboardEvent): string | null {
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl');
    if (event.altKey) parts.push('Alt');
    if (event.shiftKey) parts.push('Shift');

    const key = this.normalizeKey(event);
    if (!key) return null;
    // Require at least one modifier so we never bind a bare key globally.
    if (parts.length === 0) return null;

    parts.push(key);
    return parts.join('+');
  }

  private normalizeKey(event: KeyboardEvent): string | null {
    const k = event.key;

    if (k === ' ') return 'Space';
    if (k.startsWith('Arrow')) return k.slice(5); // ArrowUp -> Up
    if (k === 'Enter') return 'Return';
    if (/^F\d{1,2}$/.test(k)) return k; // F1..F24

    const named: Record<string, string> = {
      Backspace: 'Backspace',
      Delete: 'Delete',
      Tab: 'Tab',
      Insert: 'Insert',
      Home: 'Home',
      End: 'End',
      PageUp: 'PageUp',
      PageDown: 'PageDown',
    };
    if (named[k]) return named[k];

    // Single printable character (letter, digit, punctuation).
    if (k.length === 1) return k.toUpperCase();

    return null;
  }

  async resetAll(): Promise<void> {
    const res = await this.electronService.resetShortcuts();
    if (res.success && res.shortcuts) {
      this.shortcuts = res.shortcuts;
      this.electronService.showToast('Shortcuts reset to defaults');
    } else {
      this.electronService.showToast(res.error || 'Could not reset shortcuts');
    }
  }

  async resetOne(s: ShortcutBinding): Promise<void> {
    const res = await this.electronService.saveShortcut(s.id, s.defaultAccelerator);
    if (res.success && res.shortcuts) {
      this.shortcuts = res.shortcuts;
    } else {
      this.electronService.showToast(res.error || 'Could not reset shortcut');
    }
  }
}
