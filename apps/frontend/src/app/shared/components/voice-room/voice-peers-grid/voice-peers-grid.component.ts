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
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoicePeerTileComponent } from '../voice-peer-tile/voice-peer-tile.component';
import { VoiceControlsBarComponent } from '../voice-controls-bar/voice-controls-bar.component';
import {
  resolveVoiceSessionPeers,
  voicePeersGridClass,
} from '../voice-session-peers';

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

  /**
   * Compact layout for embedded direct-call panel (constrained height).
   */
  public readonly compact = input(false);

  /**
   * When false, only the peer tiles are shown (controls rendered by parent).
   */
  public readonly showControls = input(true);

  /**
   * Emitted after the user leaves the current voice session / call.
   * Parents can use this for navigation (e.g. voice-room route → home).
   */
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

  protected async onHangup(): Promise<void> {
    await this.voiceLeaveService.leaveActiveVoice();
    this.left.emit();
  }
}
