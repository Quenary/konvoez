import { TuiButton, TuiRoot } from '@taiga-ui/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { Store } from '@ngrx/store';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@core/auth/auth.selectors';
import { TuiChevron } from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, map, of } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { VoiceRoomPanelComponent } from '@features/rooms/voice-room-panel/voice-room-panel.component';
import { RoomsComponent } from '@features/rooms/rooms.component';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { EPermission } from '@konvoez/shared';
import { ConnectionStateNotificationComponent } from '@shared/components/connection-state-notification/connection-state-notification.component';
import { PwaUpdateNotificationComponent } from '@shared/components/pwa-update-notification/pwa-update-notification.component';
import { PendingCallDialogComponent } from '@shared/components/voice-room/pending-call-dialog/pending-call-dialog.component';
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
    ConnectionStateNotificationComponent,
    PwaUpdateNotificationComponent,
    PendingCallDialogComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly store = inject(Store);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly publicApiService = inject(PublicApiService);
  private readonly router = inject(Router);

  protected readonly isAuthenticated =
    this.store.selectSignal(selectIsAuthorized);
  protected readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly isOwner = computed(() => {
    return Boolean(this.currentUser()?.isOwner);
  });

  protected readonly canManageInvites = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_INVITES),
    );
  });

  protected readonly canManageUsers = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_USERS),
    );
  });

  protected readonly canManageRoles = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_ROLES),
    );
  });

  protected readonly canManageSettings = computed(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MANAGE_SETTINGS),
    );
  });

  protected readonly canSeeAdminSection = computed(() => {
    const invites = this.canManageInvites();
    const users = this.canManageUsers();
    const roles = this.canManageRoles();
    const settings = this.canManageSettings();
    return invites || users || roles || settings;
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

  private readonly navigationEnd = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ),
  );

  constructor() {
    effect(() => {
      this.navigationEnd();
      untracked(() => {
        const isNarrow = this.isNarrow();
        if (isNarrow) {
          this.collapsed.set(true);
        }
      });
    });
  }
}
