import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { SettingsActions } from './settings.actions';
import { tap } from 'rxjs';
import { EStorageKey } from '@app/app.enums';
import { VoiceRoomService } from '@core/services/voice-room.service';

@Injectable()
export class SettingsEffects {
  private readonly actions$ = inject(Actions);
  private readonly voiceRoomService = inject(VoiceRoomService);

  readonly init$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SettingsActions.init),
        tap((action) => {
          this.voiceRoomService.setAudioInput(action.audioInput);
          this.voiceRoomService.setAudioOutput(action.audioOutput);
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
          this.voiceRoomService.setAudioInput(action.audioInput);
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
          this.voiceRoomService.setAudioOutput(action.audioOutput);
        }),
      ),
    { dispatch: false },
  );
}
