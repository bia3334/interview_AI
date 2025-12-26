import { Component, OnInit } from '@angular/core';
import { ElectronService } from '../../services/electron.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.css'],
  standalone: false
})
export class ToastComponent implements OnInit {
  message: string = '';
  show: boolean = false;

  constructor(private electronService: ElectronService) {}

  ngOnInit() {
    this.electronService.onToast().subscribe((msg: string) => {
      this.showMessage(msg);
    });
  }

  showMessage(msg: string, duration: number = 1000) {
    this.message = msg;
    this.show = true;
    setTimeout(() => {
      this.show = false;
    }, duration);
  }
}

