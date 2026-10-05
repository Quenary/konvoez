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
import {
  resolveVoiceSessionPeers,
  voicePeersGridClass,
} from '../voice-session-peers';
import { parseError } from '@shared/functions/parse-error.function';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';

@Component({
  selector: 'app-voice-peers-grid',
  imports: [VoicePeerTileComponent, VoiceControlsBarComponent],
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
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  public readonly compact = input(false);
  public readonly showControls = input(true);
  public readonly left = output<void>();

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

  protected readonly gridClass = computed(() =>
    voicePeersGridClass(this.peers().length),
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly videoTracksByPeerId = computed(() => {
    const me = this.currentUser();
    const localTrack = this.peerVideoService.localTrack();
    const remoteTracks = this.peerVideoService.remoteTracks();
    const map = new Map<number, MediaStreamTrack | null>();
    for (const peer of this.peers()) {
      const isLocal = Boolean(me && me.id === peer.id);
      map.set(
        peer.id,
        isLocal ? localTrack : (remoteTracks.get(peer.id) ?? null),
      );
    }
    return map;
  });

  protected readonly screenAvailableByPeerId = computed(() => {
    const available = this.peerVideoService.availableScreens();
    const map = new Map<number, boolean>();
    for (const peer of this.peers()) {
      map.set(peer.id, Boolean(available.get(peer.id)?.videoProducerId));
    }
    return map;
  });

  protected readonly watchingByPeerId = computed(() => {
    const watching = this.peerVideoService.watchingUserIds();
    const map = new Map<number, boolean>();
    for (const peer of this.peers()) {
      map.set(peer.id, watching.has(peer.id));
    }
    return map;
  });

  /** True when the displayed track is a screen share (local screen or watching). */
  protected readonly showingScreenByPeerId = computed(() => {
    const me = this.currentUser();
    const localScreen = this.peerVideoService.localScreenTrack();
    const watching = this.peerVideoService.watchingUserIds();
    const map = new Map<number, boolean>();
    for (const peer of this.peers()) {
      const isLocal = Boolean(me && me.id === peer.id);
      map.set(peer.id, isLocal ? localScreen !== null : watching.has(peer.id));
    }
    return map;
  });

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
    await this.voiceLeaveService.leaveActiveVoice();
    this.left.emit();
  }
}
