import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  inject,
  input,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoiceRoomTileComponent } from '../voice-room-tile/voice-room-tile.component';
import { VoiceRoomControlsBarComponent } from '../voice-room-controls-bar/voice-room-controls-bar.component';
import { VoiceRoomTheatreComponent } from '../voice-room-theatre/voice-room-theatre.component';
import { VoiceRoomTheatreWatchControlsComponent } from '../voice-room-theatre-watch-controls/voice-room-theatre-watch-controls.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceOverlaySlotDirective } from '../voice-overlay-slot.directive';
import { resolveVoiceSessionPeers } from '../voice-session-peers';
import { voiceSectionGridClass } from '../voice-peers-layout';
import {
  buildVoiceRoomTiles,
  resolveTheatreTile,
  showsRemoteScreenWatchControls,
  type TVoiceStreamKind,
} from '../voice-room-tiles';
import { parseError } from '@shared/functions/parse-error.function';
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
    VoiceRoomControlsBarComponent,
    VoiceRoomTheatreComponent,
    VoiceRoomTheatreWatchControlsComponent,
  ],
  templateUrl: './voice-room-grid.component.html',
  styleUrl: './voice-room-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomGridComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly voiceLeaveService = inject(VoiceLeaveService);
  private readonly directCallService = inject(DirectCallService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  public readonly compact = input(false);
  public readonly showControls = input(true);
  public readonly left = output<void>();

  private readonly overlaySlot = contentChild(VoiceOverlaySlotDirective);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly peers = computed(() => {
    const me = this.currentUser();
    const remotePeers = this.voiceRoomStore.peersList();
    const session = this.voiceRoomStore.activeSession();
    const interlocutor = this.directCallService.interlocutor();
    const isCalling = this.directCallService.isCalling();
    const isIncoming = this.directCallService.isIncoming();
    const isRinging = isCalling || isIncoming;
    return resolveVoiceSessionPeers({
      me,
      remotePeers,
      session,
      isRinging,
      interlocutor,
    });
  });

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

  protected readonly watchUserId = computed(
    () => this.theatreTile()?.peerId ?? null,
  );

  protected readonly overlayTemplate = computed(
    () => this.overlaySlot()?.template ?? null,
  );

  protected readonly showRemoteScreenWatchControls = computed(() => {
    const tile = this.theatreTile();
    const localUserId = this.currentUser()?.id ?? null;
    const watching = this.peerVideoService.watchingUserIds();
    return showsRemoteScreenWatchControls(
      tile ? { peerId: tile.peerId, stream: tile.streamKind } : null,
      localUserId,
      watching,
    );
  });

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
      this.tuiNotificationsService
        .open(
          parseError(error) ||
            this.translateService.instant('CALL.WATCH_SCREEN_FAILED'),
          {
            appearance: 'negative',
            autoClose: 5000,
            closable: true,
          },
        )
        .subscribe();
    }
  }

  protected async onStopWatchScreen(userId: number): Promise<void> {
    await this.voiceSessionService.stopWatchingPeerScreen(userId);
  }

  protected onEscape(event: KeyboardEvent): void {
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

  protected async onHangup(): Promise<void> {
    await this.voiceLeaveService.leaveActiveVoice();
    this.left.emit();
  }
}
