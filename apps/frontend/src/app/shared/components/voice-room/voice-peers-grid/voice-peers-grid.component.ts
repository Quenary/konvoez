import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { DirectCallService } from '@core/services/direct-call.service';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoicePeerTileComponent } from '../voice-peer-tile/voice-peer-tile.component';
import { VoiceControlsBarComponent } from '../voice-controls-bar/voice-controls-bar.component';
import { VoiceTheatreComponent } from '../voice-theatre/voice-theatre.component';
import { VoiceTheatreWatchControlsComponent } from '../voice-theatre-watch-controls/voice-theatre-watch-controls.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { resolveVoiceSessionPeers } from '../voice-session-peers';
import { voiceSectionGridClass } from '../voice-peers-layout';
import {
  buildVoicePeerTiles,
  findVoicePeerTile,
  type TVoiceStreamKind,
} from '../voice-peer-tiles';
import { parseError } from '@shared/functions/parse-error.function';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { IUser } from '@konvoez/shared';

@Component({
  selector: 'app-voice-peers-grid',
  imports: [
    VoicePeerTileComponent,
    VoiceControlsBarComponent,
    VoiceTheatreComponent,
    VoiceTheatreWatchControlsComponent,
  ],
  templateUrl: './voice-peers-grid.component.html',
  styleUrl: './voice-peers-grid.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoicePeersGridComponent {
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
    return buildVoicePeerTiles({
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
  protected readonly theatreFocusStream =
    this.voiceRoomViewService.theatreFocusStream;
  protected readonly theatreShowsRemoteScreenWatchControls =
    this.voiceRoomViewService.theatreShowsRemoteScreenWatchControls;

  protected readonly theatreFocusPeer = computed((): IUser | null => {
    const focus = this.theatreFocus();
    if (focus == null) {
      return null;
    }
    return this.peers().find((peer) => peer.id === focus.peerId) ?? null;
  });

  protected readonly theatreVideoTrack = computed(() => {
    const focus = this.theatreFocus();
    if (focus == null) {
      return null;
    }
    const tile = findVoicePeerTile(this.tiles(), focus.peerId, focus.stream);
    return tile?.videoTrack ?? null;
  });

  protected onOpenTheatre(
    userId: number,
    streamKind: TVoiceStreamKind | null,
  ): void {
    if (streamKind == null) {
      return;
    }
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

  protected async onHangup(): Promise<void> {
    this.voiceRoomViewService.closeTheatre();
    await this.voiceLeaveService.leaveActiveVoice();
    this.left.emit();
  }
}
