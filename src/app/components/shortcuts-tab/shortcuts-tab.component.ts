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
    { action: 'Process Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'P'] },
    { action: 'Move Window Up', keys: ['Ctrl/Cmd', 'Shift', '↑'] },
    { action: 'Move Window Down', keys: ['Ctrl/Cmd', 'Shift', '↓'] },
    { action: 'Move Window Left', keys: ['Ctrl/Cmd', 'Shift', '←'] },
    { action: 'Move Window Right', keys: ['Ctrl/Cmd', 'Shift', '→'] },
    { action: 'Change Answer Type', keys: ['Ctrl/Cmd', 'Shift', 'L'] },
    { action: 'Delete All Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'D'] },
    { action: 'Switch to Next Tab', keys: ['Ctrl/Cmd', 'Shift', 'Space'] },
    { action: 'Switch to Previous Tab', keys: ['Ctrl/Cmd', 'Shift', 'Tab'] },
    { action: 'Switch AI Model (OpenAI/Gemini/Both)', keys: ['Ctrl/Cmd', 'Shift', 'M'] },
    { action: 'Copy Response to Clipboard', keys: ['Ctrl/Cmd', 'Shift', 'C'] },
    { action: 'Process Clipboard Text as Prompt', keys: ['Ctrl/Cmd', 'Shift', 'Q'] },
    { action: '📸 Take Full Screenshot', keys: ['Ctrl/Cmd', 'Shift', 'S'] },
    { action: '🎯 Take Region Screenshot', keys: ['Ctrl/Cmd', 'Shift', 'Z'] },
    { action: '📝 Extract Text from Screenshots', keys: ['Ctrl/Cmd', 'Shift', 'X'] }
  ];
}

