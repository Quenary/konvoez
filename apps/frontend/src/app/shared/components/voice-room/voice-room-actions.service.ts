import { Injectable, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { notifyError } from '@shared/functions/notify-error.function';
import { VoiceRoomTilesService } from './voice-room-tiles.service';
import { VoiceRoomViewService } from './voice-room-view.service';
import { pickDefaultTheatreTile } from './voice-room-tiles';

/** User-initiated voice room actions shared by tiles, overlay and controls. */
@Injectable({ providedIn: 'root' })
export class VoiceRoomActionsService {
  private readonly store = inject(Store);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly voiceRoomTilesService = inject(VoiceRoomTilesService);
  private readonly translateService = inject(TranslateService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public async watchPeerScreen(userId: number): Promise<void> {
    try {
      await this.voiceSessionService.watchPeerScreen(userId);
    } catch (error) {
      console.error('Failed to watch screen', error);
      notifyError(
        this.tuiNotificationsService,
        this.translateService,
        'CALL.WATCH_SCREEN_FAILED',
        error,
      );
    }
  }

  public async stopWatchingPeerScreen(userId: number): Promise<void> {
    await this.voiceSessionService.stopWatchingPeerScreen(userId);
  }

  /**
   * Grid -> theatre on the remembered tile (or a default one), theatre -> grid.
   * Does nothing when there is no tile to put on the stage.
   */
  public toggleLayout(): void {
    if (this.voiceRoomViewService.layout() === 'theatre') {
      this.voiceRoomViewService.showGrid();
      return;
    }
    const focus = this.voiceRoomViewService.theatreFocus();
    if (focus) {
      this.voiceRoomViewService.openTheatre(focus.peerId, focus.stream);
      return;
    }
    const localUserId = this.currentUser()?.id ?? null;
    const tile = pickDefaultTheatreTile(
      this.voiceRoomTilesService.tiles(),
      localUserId,
    );
    if (tile) {
      this.voiceRoomViewService.openTheatre(tile.peerId, tile.streamKind);
    }
  }
}
