import { Injectable, computed, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { PeerVideoService } from '@core/services/peer-video.service';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoiceSessionPeersService } from './voice-session-peers.service';
import { VoiceRoomViewService } from './voice-room-view.service';
import { buildVoiceRoomTiles, resolveTheatreTile } from './voice-room-tiles';

/** Read model of the voice room: which tiles exist and which one is on stage. */
@Injectable({ providedIn: 'root' })
export class VoiceRoomTilesService {
  private readonly store = inject(Store);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly voiceSessionPeersService = inject(VoiceSessionPeersService);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly tiles = computed(() => {
    const me = this.currentUser();
    return buildVoiceRoomTiles({
      peers: this.voiceSessionPeersService.peers(),
      localUserId: me?.id ?? null,
      localCamTrack: this.peerVideoService.localCamTrack(),
      localScreenTrack: this.peerVideoService.localScreenTrack(),
      remoteCamTracks: this.peerVideoService.remoteCamTracks(),
      remoteScreenTracks: this.peerVideoService.remoteScreenTracks(),
      availableScreens: this.peerVideoService.availableScreens(),
      watchingUserIds: this.peerVideoService.watchingUserIds(),
    });
  });

  /**
   * Tile on the theatre stage. Null outside theatre layout, even though the
   * focus is remembered for the next visit.
   */
  public readonly theatreTile = computed(() => {
    const layout = this.voiceRoomViewService.layout();
    const focus = this.voiceRoomViewService.theatreFocus();
    const tiles = this.tiles();
    const localUserId = this.currentUser()?.id ?? null;
    if (layout !== 'theatre') {
      return null;
    }
    return resolveTheatreTile(focus, tiles, localUserId);
  });
}
