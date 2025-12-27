import { Component, OnInit, ChangeDetectorRef, NgZone } from '@angular/core';
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

  constructor(
    private electronService: ElectronService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {}

  ngOnInit() {
    this.electronService.onToast().subscribe((msg: string) => {
      // Defer to next tick to avoid ExpressionChangedAfterItHasBeenCheckedError
      setTimeout(() => {
        this.ngZone.run(() => {
          this.showMessage(msg);
        });
      }, 0);
    });
  }

  showMessage(msg: string, duration: number = 2000) {
    this.message = msg;
    this.show = true;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.ngZone.run(() => {
        this.show = false;
        this.cdr.detectChanges();
      });
    }, duration);
  }
}

