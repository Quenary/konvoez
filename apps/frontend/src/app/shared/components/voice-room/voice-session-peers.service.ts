import { Injectable, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { DirectCallService } from '@core/services/direct-call.service';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { resolveVoiceSessionPeers } from './voice-session-peers';

/**
 * One participant list for the grid, the room page, and the direct-call panel.
 */
@Injectable({ providedIn: 'root' })
export class VoiceSessionPeersService {
  private readonly store = inject(Store);
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly directCallService = inject(DirectCallService);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peers = computed(() => {
    const me = this.currentUser();
    const remotePeers = this.voiceRoomStore.peersList();
    const session = this.voiceRoomStore.activeSession();
    const interlocutor = this.directCallService.interlocutor();
    const isCalling = this.directCallService.isCalling();
    const isIncoming = this.directCallService.isIncoming();
    return resolveVoiceSessionPeers({
      me,
      remotePeers,
      session,
      isRinging: isCalling || isIncoming,
      interlocutor,
    });
  });

  public readonly count = computed(() => this.peers().length);
}
