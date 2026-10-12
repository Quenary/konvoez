import { Injectable, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { resolveVoiceSessionPeers } from './voice-session-peers';

/**
 * One participant list for the grid, voice room page, and direct call shell.
 */
@Injectable({ providedIn: 'root' })
export class VoiceSessionPeersService {
  private readonly store = inject(Store);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly peers = computed(() => {
    const me = this.currentUser();
    const remotePeers = this.voiceSessionStore.peersList();
    const session = this.voiceSessionStore.activeSession();
    return resolveVoiceSessionPeers({
      me,
      remotePeers,
      session,
    });
  });

  public readonly count = computed(() => this.peers().length);
}
