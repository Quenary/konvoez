import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
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
import { ScreenSharePipComponent } from '../screen-share-pip/screen-share-pip.component';
import { VoiceTheatreComponent } from '../voice-theatre/voice-theatre.component';
import { resolveVoiceSessionPeers } from '../voice-session-peers';
import {
  partitionVoicePeers,
  voiceSectionGridClass,
} from '../voice-peers-layout';
import { parseError } from '@shared/functions/parse-error.function';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { IUser } from '@konvoez/shared';

type TPeerIdRecord<T> = Record<number, T>;

@Component({
  selector: 'app-voice-peers-grid',
  imports: [
    VoicePeerTileComponent,
    VoiceControlsBarComponent,
    ScreenSharePipComponent,
    VoiceTheatreComponent,
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
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  public readonly compact = input(false);
  public readonly showControls = input(true);
  public readonly left = output<void>();

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly theatreFocusId = signal<number | null>(null);

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

  protected readonly videoTracksByPeerId = computed(() => {
    const me = this.currentUser();
    const localCam = this.peerVideoService.localCamTrack();
    const remoteTracks = this.peerVideoService.remoteTracks();
    const byPeerId: TPeerIdRecord<MediaStreamTrack | null> = {};
    for (const peer of this.peers()) {
      const isLocal = Boolean(me && me.id === peer.id);
      byPeerId[peer.id] = isLocal ? localCam : (remoteTracks[peer.id] ?? null);
    }
    return byPeerId;
  });

  protected readonly screenAvailableByPeerId = computed(() => {
    const me = this.currentUser();
    const available = this.peerVideoService.availableScreens();
    const localScreen = this.peerVideoService.localScreenTrack();
    const byPeerId: TPeerIdRecord<boolean> = {};
    for (const peer of this.peers()) {
      const isLocal = Boolean(me && me.id === peer.id);
      byPeerId[peer.id] = isLocal
        ? localScreen !== null
        : Boolean(available[peer.id]?.videoProducerId);
    }
    return byPeerId;
  });

  protected readonly watchingByPeerId = computed(() => {
    const watching = this.peerVideoService.watchingUserIds();
    const byPeerId: TPeerIdRecord<boolean> = {};
    for (const peer of this.peers()) {
      byPeerId[peer.id] = watching.has(peer.id);
    }
    return byPeerId;
  });

  protected readonly showingScreenByPeerId = computed(() => {
    const me = this.currentUser();
    const watching = this.peerVideoService.watchingUserIds();
    const byPeerId: TPeerIdRecord<boolean> = {};
    for (const peer of this.peers()) {
      const isLocal = Boolean(me && me.id === peer.id);
      byPeerId[peer.id] = !isLocal && watching.has(peer.id);
    }
    return byPeerId;
  });

  protected readonly screenLiveByPeerId = computed(() => {
    return this.screenAvailableByPeerId();
  });

  protected readonly peerPartitions = computed(() => {
    const tracks = this.videoTracksByPeerId();
    const screens = this.screenAvailableByPeerId();
    return partitionVoicePeers(this.peers(), (id) => {
      return Boolean(screens[id] || tracks[id]);
    });
  });

  protected readonly streamingPeers = computed(
    () => this.peerPartitions().streaming,
  );

  protected readonly voiceOnlyPeers = computed(
    () => this.peerPartitions().voiceOnly,
  );

  protected readonly streamingSectionClass = computed(() =>
    voiceSectionGridClass(this.streamingPeers().length),
  );

  protected readonly voiceSectionClass = computed(() =>
    voiceSectionGridClass(this.voiceOnlyPeers().length),
  );

  protected readonly hasSplitLayout = computed(
    () => this.streamingPeers().length > 0 && this.voiceOnlyPeers().length > 0,
  );

  protected readonly theatreFocusPeer = computed((): IUser | null => {
    const id = this.theatreFocusId();
    if (id == null) {
      return null;
    }
    return this.peers().find((peer) => peer.id === id) ?? null;
  });

  protected readonly theatreVideoTrack = computed(() => {
    const peer = this.theatreFocusPeer();
    if (!peer) {
      return null;
    }
    return this.videoTracksByPeerId()[peer.id] ?? null;
  });

  constructor() {
    effect(() => {
      const focusId = this.theatreFocusId();
      if (focusId == null) {
        return;
      }
      const watching = this.watchingByPeerId()[focusId];
      const stillPresent = this.peers().some((peer) => peer.id === focusId);
      if (!watching || !stillPresent) {
        this.theatreFocusId.set(null);
      }
    });
  }

  protected onOpenTheatre(userId: number): void {
    const me = this.currentUser();
    if (me && me.id === userId) {
      return;
    }
    if (!this.watchingByPeerId()[userId]) {
      return;
    }
    this.theatreFocusId.set(userId);
  }

  protected onCloseTheatre(): void {
    this.theatreFocusId.set(null);
  }

  protected onTheatreFocusPeer(userId: number): void {
    this.onOpenTheatre(userId);
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
    if (this.theatreFocusId() === userId) {
      this.theatreFocusId.set(null);
    }
  }

  protected async onTheatreStopWatch(): Promise<void> {
    const id = this.theatreFocusId();
    if (id == null) {
      return;
    }
    await this.onStopWatchScreen(id);
  }

  protected async onHangup(): Promise<void> {
    this.theatreFocusId.set(null);
    await this.voiceLeaveService.leaveActiveVoice();
    this.left.emit();
  }
}
