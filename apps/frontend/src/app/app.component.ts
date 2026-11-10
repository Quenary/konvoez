import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  untracked,
} from '@angular/core';
import { WA_IS_IOS } from '@ng-web-apis/platform';
import {
  TUI_PULL_TO_REFRESH_THRESHOLD,
  TuiPullToRefresh,
} from '@taiga-ui/addon-mobile';
import { TuiButton, TuiRoot } from '@taiga-ui/core';
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
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, of } from 'rxjs';
import { TranslatePipe } from '@ngx-translate/core';
import { CallControlsAsideComponent } from '@shared/call-controls/call-controls-aside/call-controls-aside.component';
import { RoomsComponent } from '@features/rooms/rooms.component';
import { MobileTabBarComponent } from '@shared/components/mobile-tab-bar/mobile-tab-bar.component';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { EPermission } from '@konvoez/shared';
import { ConnectionStateNotificationComponent } from '@shared/components/connection-state-notification/connection-state-notification.component';
import { VoiceConnectionNotificationComponent } from '@shared/components/voice-connection-notification/voice-connection-notification.component';
import { PwaUpdateNotificationComponent } from '@shared/components/pwa-update-notification/pwa-update-notification.component';
import { PendingCallDialogComponent } from '@shared/components/voice-room/pending-call-dialog/pending-call-dialog.component';
import { PublicApiService } from '@core/services/public-api.service';
import { LayoutService } from '@core/services/layout.service';
import { icons } from '@constants';
import { pullDistancePx } from './pull-to-refresh';
import { PullToRefreshDirective } from './pull-to-refresh.directive';

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
    CallControlsAsideComponent,
    MobileTabBarComponent,
    RouterLink,
    TuiRoot,
    TuiPullToRefresh,
    PullToRefreshDirective,
    TuiButton,
    TuiNavigation,
    TuiChevron,
    LogoComponent,
    ConnectionStateNotificationComponent,
    VoiceConnectionNotificationComponent,
    PwaUpdateNotificationComponent,
    PendingCallDialogComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: TUI_PULL_TO_REFRESH_THRESHOLD,
      useFactory: () =>
        pullDistancePx(inject(DOCUMENT).defaultView?.innerHeight ?? 0),
    },
  ],
})
export class App {
  private readonly store = inject(Store);
  private readonly publicApiService = inject(PublicApiService);
  private readonly router = inject(Router);
  private readonly layoutService = inject(LayoutService);
  private readonly document = inject(DOCUMENT);
  private readonly isIos = inject(WA_IS_IOS);
  private readonly pullThreshold = inject(TUI_PULL_TO_REFRESH_THRESHOLD);

  protected readonly icons = icons;

  /**
   * Taiga follows the finger for the whole drag on iOS (`top: distance / 2`).
   * Stop the shift at the pull distance, about a tenth of the screen.
   */
  protected readonly pullShift = (
    distance: number,
  ): Record<string, string> | null => {
    if (!this.isIos) {
      return null;
    }
    const shift = Math.min(distance / 2, this.pullThreshold);
    return { top: `${shift}px` };
  };

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

  protected readonly isMobile = this.layoutService.isMobile;
  protected readonly isSmall = this.layoutService.isSmall;

  protected readonly collapsed = linkedSignal(this.isSmall);

  protected readonly versionInfo = rxResource({
    stream: () =>
      this.publicApiService
        .getVersion()
        .pipe(catchError(() => of(DEFAULT_VERSION_INFO))),
    defaultValue: DEFAULT_VERSION_INFO,
  });

  private readonly navigationEnd = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
    ),
  );

  constructor() {
    effect(() => {
      this.navigationEnd();
      untracked(() => {
        if (this.isSmall()) {
          this.collapsed.set(true);
        }
      });
    });
  }

  protected reloadPage(): void {
    this.document.defaultView?.location.reload();
  }
}
