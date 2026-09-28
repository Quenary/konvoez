import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { DirectCallService } from '@core/services/direct-call.service';
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
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly directCallService = inject(DirectCallService);

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
    const remotePeers = this.voiceRoomService.peersList();
    const session = this.voiceRoomService.activeSession();
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

  protected async onHangup(): Promise<void> {
    await this.voiceRoomService.leaveCurrent();
    this.left.emit();
  }
}
