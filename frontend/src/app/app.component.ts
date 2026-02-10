import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { WebrtcService } from './core/services/webrtc.service';
import { ButtonModule } from 'primeng/button';
import { RoomsComponent } from './features/rooms/rooms.component';
import { Store } from '@ngrx/store';
import { selectIsAuthorized } from './features/auth/auth.selectors';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule, RoomsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  protected readonly title = signal('konvoez-frontend');
  private readonly webrtcService = inject(WebrtcService);
  private readonly store = inject(Store);

  protected readonly isAuthenticated = this.store.selectSignal(selectIsAuthorized);

  protected join(roomId: string): void {
    this.webrtcService.init(roomId);
  }
}
