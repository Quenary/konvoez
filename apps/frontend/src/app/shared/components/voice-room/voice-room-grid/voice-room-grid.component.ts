import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  inject,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoiceRoomTileComponent } from '../voice-room-tile/voice-room-tile.component';
import { VoiceRoomTheatreComponent } from '../voice-room-theatre/voice-room-theatre.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceOverlaySlotDirective } from '../voice-overlay-slot.directive';
import { VoiceSessionPeersService } from '../voice-session-peers.service';
import { voiceSectionGridClass } from '../voice-peers-layout';
import {
  buildVoiceRoomTiles,
  resolveTheatreTile,
  type TVoiceStreamKind,
} from '../voice-room-tiles';
import { notifyError } from '@shared/functions/notify-error.function';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';

@Component({
  selector: 'app-voice-room-grid',
  host: {
    '(document:keydown.escape)': 'onEscape($event)',
  },
  imports: [
    NgTemplateOutlet,
    VoiceRoomTileComponent,
    VoiceRoomTheatreComponent,
  ],
  templateUrl: './voice-room-grid.component.html',
  styleUrl: './voice-room-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomGridComponent {
  private readonly store = inject(Store);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionPeersService = inject(VoiceSessionPeersService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  private readonly overlaySlot = contentChild(VoiceOverlaySlotDirective);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly peers = this.voiceSessionPeersService.peers;

  protected readonly tiles = computed(() => {
    const me = this.currentUser();
    return buildVoiceRoomTiles({
      peers: this.peers(),
      localUserId: me?.id ?? null,
      localCamTrack: this.peerVideoService.localCamTrack(),
      localScreenTrack: this.peerVideoService.localScreenTrack(),
      remoteCamTracks: this.peerVideoService.remoteCamTracks(),
      remoteScreenTracks: this.peerVideoService.remoteScreenTracks(),
      availableScreens: this.peerVideoService.availableScreens(),
      watchingUserIds: this.peerVideoService.watchingUserIds(),
    });
  });

  protected readonly peersSectionClass = computed(() =>
    voiceSectionGridClass(this.tiles().length),
  );

  protected readonly theatreFocus = this.voiceRoomViewService.theatreFocus;

  protected readonly theatreTile = computed(() => {
    const focus = this.theatreFocus();
    const tiles = this.tiles();
    const localUserId = this.currentUser()?.id ?? null;
    return resolveTheatreTile(focus, tiles, localUserId);
  });

  protected readonly overlayTemplate = computed(
    () => this.overlaySlot()?.template ?? null,
  );

  protected onOpenTheatre(
    userId: number,
    streamKind: TVoiceStreamKind | null,
  ): void {
    this.voiceRoomViewService.openTheatre(userId, streamKind);
  }

  protected async onWatchScreen(userId: number): Promise<void> {
    try {
      await this.voiceSessionService.watchPeerScreen(userId);
    } catch (error) {
      console.error('Failed to watch screen', error);
      notifyError(
        this.tuiNotificationsService,
        this.translateService,
        'CALL.WATCH_SCREEN_FAILED',
        error,
      );
    }
  }

  protected async onStopWatchScreen(userId: number): Promise<void> {
    await this.voiceSessionService.stopWatchingPeerScreen(userId);
  }

  protected onEscape(event: Event): void {
    if (
      !this.voiceRoomViewService.theatreOpen() ||
      document.fullscreenElement
    ) {
      return;
    }
    const overlayOpen = document.querySelector(
      'tui-dialog, tui-dropdown, tui-sheet-dialog',
    );
    queueMicrotask(() => {
      if (
        event.defaultPrevented ||
        overlayOpen ||
        document.fullscreenElement ||
        !this.voiceRoomViewService.theatreOpen()
      ) {
        return;
      }
      this.voiceRoomViewService.closeTheatre();
    });
  }
}
