import { TuiButton, TuiRoot } from '@taiga-ui/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@core/auth/auth.selectors';
import { TuiChevron } from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { VoiceRoomPanelComponent } from '@features/rooms/voice-room-panel/voice-room-panel.component';
import { RoomsComponent } from '@features/rooms/rooms.component';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { EUserRole } from '@konvoez/shared';
import { IncomingCallDialogComponent } from '@shared/components/voice-room/incoming-call-dialog/incoming-call-dialog.component';
import { PublicApiService } from '@core/services/public-api.service';

const DEFAULT_VERSION_INFO = {
  currentVersion: '',
  availableVersion: '',
  releaseUrl: null,
  updateAvailable: false,
};

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
    IncomingCallDialogComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly store = inject(Store);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly publicApiService = inject(PublicApiService);

  protected readonly isAuthenticated =
    this.store.selectSignal(selectIsAuthorized);
  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly isAdminOrOwner = computed(() => {
    const role = this.currentUser()?.role;
    return role === EUserRole.ADMIN || role === EUserRole.OWNER;
  });

  protected readonly isOwner = computed(() => {
    return this.currentUser()?.role === EUserRole.OWNER;
  });

  protected readonly collapsed = linkedSignal(() => this.isNarrow());

  protected readonly versionInfo = rxResource({
    stream: () =>
      this.publicApiService
        .getVersion()
        .pipe(catchError(() => of(DEFAULT_VERSION_INFO))),
    defaultValue: DEFAULT_VERSION_INFO,
  });

  private readonly isNarrow = toSignal<boolean, boolean>(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.Small])
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );
}
