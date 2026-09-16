import { TuiButton, TuiRoot } from '@taiga-ui/core';
import { Component, computed, inject, linkedSignal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from './features/auth/auth.selectors';
import { TuiChevron } from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { VoiceRoomPanelComponent } from '@features/rooms/voice-room-panel/voice-room-panel.component';
import { RoomsComponent } from '@features/rooms/rooms.component';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { EUserRole } from '@konvoez/shared';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    TranslatePipe,
    RoomsComponent,
    VoiceRoomPanelComponent,
    RouterLink,
    TuiRoot,
    TuiButton,
    TuiNavigation,
    TuiChevron,
    LogoComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class App {
  private readonly store = inject(Store);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly isAuthenticated =
    this.store.selectSignal(selectIsAuthorized);
  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly isAdminOrOwner = computed(() => {
    const role = this.currentUser()?.role;
    return role === EUserRole.ADMIN || role === EUserRole.OWNER;
  });

  protected readonly collapsed = linkedSignal(() => this.isNarrow());

  private readonly isNarrow = toSignal<boolean, boolean>(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );
}
