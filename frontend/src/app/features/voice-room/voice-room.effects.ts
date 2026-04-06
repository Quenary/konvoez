import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { selectIsAuthorized } from '../auth/auth.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, tap } from 'rxjs';
import { VoiceRoomCommon } from '@common/voice-room';
import { VoiceRoomActions } from './voice-room.actions';
import { AudioService } from '@core/services/audio.service';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { VoiceRoomSocketToken } from '@core/tokens/voice-room-socket.token';

@Injectable()
export class VoiceRoomEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly audioService = inject(AudioService);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly socket = inject(VoiceRoomSocketToken);

  constructor() {
    this.store
      .select(selectIsAuthorized)
      .pipe(
        takeUntilDestroyed(),
        finalize(() => {
          this.socket.disconnect();
        }),
      )
      .subscribe((auth) => {
        if (auth) {
          this.socket.connect();
        } else {
          this.socket.disconnect();
        }
      });

    this.socket.on(VoiceRoomCommon.EEvent.EXISTING_PEERS_ALL, (data) => {
      this.store.dispatch(VoiceRoomActions.existingPeersAll({ data }));
    });
  }

  readonly join$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.join),
        tap(async (action) => {
          this.voiceRoomService.joinRoom(action.id);
          this.audioService.playPeerJoinAudio();
        }),
      ),
    { dispatch: false },
  );

  readonly leave$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(VoiceRoomActions.leave),
        tap(() => {
          this.voiceRoomService.leaveRoom();
          this.audioService.playPeerLeaveAudio();
        }),
      ),
    { dispatch: false },
  );
}
