import { Component } from '@angular/core';

@Component({
  selector: 'app-shortcuts-tab',
  templateUrl: './shortcuts-tab.component.html',
  styleUrls: ['./shortcuts-tab.component.css'],
  standalone: false
})
export class ShortcutsTabComponent {
  shortcuts = [
    { action: 'Toggle Window Visibility', keys: ['Ctrl/Cmd', 'Shift', 'A'] },
    { action: 'Toggle Mouse Events', keys: ['Ctrl/Cmd', 'Shift', 'W'] },
    { action: 'Toggle Overlay', keys: ['Ctrl/Cmd', 'Shift', 'O'] },
    { action: '📸 Take Full Screenshot', keys: ['Ctrl/Cmd', 'Shift', 'S'] },
    { action: '🎯 Take Region Screenshot', keys: ['Ctrl/Cmd', 'Shift', 'Z'] },
    { action: '📝 Extract Text from Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'X'] },
    { action: 'Process Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'P'] },
    { action: 'Delete All Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'D'] },
    { action: 'Process Clipboard as Prompt', keys: ['Ctrl/Cmd', 'Shift', 'Q'] },
    { action: 'Copy Response to Clipboard', keys: ['Ctrl/Cmd', 'Shift', 'C'] }
  ];
}

