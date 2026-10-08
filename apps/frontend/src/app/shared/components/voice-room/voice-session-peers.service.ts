import { Injectable, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { DirectCallService } from '@core/services/direct-call.service';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { resolveVoiceSessionPeers } from './voice-session-peers';

/**
 * One participant list for the grid, voice room page, and direct call shell.
 */
@Injectable({ providedIn: 'root' })
export class VoiceSessionPeersService {
  private readonly store = inject(Store);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly directCallService = inject(DirectCallService);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peers = computed(() => {
    const me = this.currentUser();
    const remotePeers = this.voiceSessionStore.peersList();
    const session = this.voiceSessionStore.activeSession();
    const interlocutor = this.directCallService.interlocutor();
    const isRinging = this.directCallService.isRinging();
    return resolveVoiceSessionPeers({
      me,
      remotePeers,
      session,
      isRinging,
      interlocutor,
    });
  });

  public readonly count = computed(() => this.peers().length);
}
