import { Component } from '@angular/core';
import { SHORTCUTS } from '../../constants/shortcuts';

@Component({
  selector: 'app-shortcuts-tab',
  templateUrl: './shortcuts-tab.component.html',
  styleUrls: ['./shortcuts-tab.component.css'],
  standalone: false
})
export class ShortcutsTabComponent {
  shortcuts = SHORTCUTS;
}

