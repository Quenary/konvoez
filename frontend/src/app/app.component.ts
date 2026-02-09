import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebrtcService } from './core/services/webrtc.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { RoomsComponent } from './features/rooms/rooms.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslatePipe, ButtonModule, RoomsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  protected readonly title = signal('konvoez-frontend');
  private readonly webrtcService = inject(WebrtcService);
  private readonly translateService = inject(TranslateService);

  protected join(roomId: string): void {
    this.webrtcService.init(roomId);

    this.translateService.use('en');
  }
}
