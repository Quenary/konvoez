import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { RoomsComponent } from './features/rooms/rooms.component';
import { Store } from '@ngrx/store';
import { selectIsAuthorized } from './features/auth/auth.selectors';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule, RoomsComponent, ToastModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  private readonly store = inject(Store);

  protected readonly isAuthenticated =
    this.store.selectSignal(selectIsAuthorized);
}
