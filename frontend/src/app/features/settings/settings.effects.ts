import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { SettingsActions } from './settings.actions';
import { tap } from 'rxjs';
import { EStorageKey } from '../../app.enums';
import { VoiceRoomActions } from '../voice-room/voice-room.actions';
import { Store } from '@ngrx/store';

@Injectable()
export class SettingsEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);

  readonly init$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SettingsActions.init),
        tap((action) => {
          this.store.dispatch(
            VoiceRoomActions.setAudioInput({ device: action.audioInput }),
          );
          this.store.dispatch(
            VoiceRoomActions.setAudioOutput({ device: action.audioOutput }),
          );
        }),
      ),
    { dispatch: false },
  );

  readonly setAudioInput$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SettingsActions.setAudioInput),
        tap(async (action) => {
          localStorage.setItemJson(EStorageKey.AUDIO_INPUT, action.audioInput);
          this.store.dispatch(
            VoiceRoomActions.setAudioInput({ device: action.audioInput }),
          );
        }),
      ),
    { dispatch: false },
  );

  readonly setAudioOutput$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SettingsActions.setAudioOutput),
        tap((action) => {
          localStorage.setItemJson(
            EStorageKey.AUDIO_OUTPUT,
            action.audioOutput,
          );
          this.store.dispatch(
            VoiceRoomActions.setAudioOutput({ device: action.audioOutput }),
          );
        }),
      ),
    { dispatch: false },
  );
}
