import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
} from '@angular/router';
import { filter, map } from 'rxjs/operators';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiTabBar } from '@taiga-ui/addon-mobile';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { CallControlsBarComponent } from '@shared/call-controls/call-controls-bar/call-controls-bar.component';
import { icons } from '@constants';

@Component({
  selector: 'app-mobile-tab-bar',
  imports: [
    TuiTabBar,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    CallControlsBarComponent,
  ],
  templateUrl: './mobile-tab-bar.component.html',
  styleUrl: './mobile-tab-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileTabBarComponent {
  private readonly router = inject(Router);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly directCallService = inject(DirectCallService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  protected readonly icons = icons;
  protected readonly routerLinkActiveOptions = { exact: false };

  protected readonly isSessionActive = computed(() => {
    return (
      this.voiceSessionStore.activeSession() !== null ||
      this.directCallService.isConnected()
    );
  });

  protected readonly showCallControlsBar = computed(() => {
    const active = this.isSessionActive();
    const url = this.currentUrl();
    return active && !url.includes('/voice-room/');
  });

  protected readonly directUnreadCount = this.unreadCountsStore.directTotal;

  protected readonly textRoomsUnreadCount = computed(() =>
    Object.values(this.unreadCountsStore.rooms()).reduce(
      (sum, count) => sum + count,
      0,
    ),
  );

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
}
