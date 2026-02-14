import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { SettingsActions } from './settings.actions';
import { tap, withLatestFrom } from 'rxjs';
import { EStorageKey } from '../../app.enums';
import { Store } from '@ngrx/store';
import { selectActiveVoiceRoomPeers } from '../voice-room/voice-room.selectors';
import { getStream } from '../../shared/functions/get-stream.function';
import { replaceStream } from '../../shared/functions/replace-stream.function';

@Injectable()
export class SettingsEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);

  readonly setAudioInput$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SettingsActions.setAudioInput),
        withLatestFrom(this.store.select(selectActiveVoiceRoomPeers)),
        tap(async ([action, peers]) => {
          localStorage.setItemJson(EStorageKey.AUDIO_INPUT, action.audioInput);

          if (peers?.length) {
            const stream = await getStream(action.audioInput);
            for (const peer of peers) {
              await replaceStream(stream, peer.rtc);
            }
          }
        }),
      ),
    { dispatch: false },
  );

  readonly setAudioOutput$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SettingsActions.setAudioOutput),
        tap((action) => {
          localStorage.setItemJson(EStorageKey.AUDIO_OUTPUT, action.audioOutput);
        }),
      ),
    { dispatch: false },
  );
}
