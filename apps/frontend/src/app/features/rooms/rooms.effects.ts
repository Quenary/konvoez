import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { RoomsActions } from './rooms.actions';
import { catchError, map, of, switchMap, tap } from 'rxjs';
import { RoomsApiService } from './rooms-api.service';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { ERoomType } from '@konvoez/shared';
import { Router } from '@angular/router';
import { VoiceRoomService } from '@core/services/voice-room.service';
import { TuiNotificationService } from '@taiga-ui/core';

@Injectable()
export class RoomsEffects {
  private readonly actions$ = inject(Actions);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly translateService = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);

  readonly selectRoom$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(RoomsActions.selectRoom),
        tap((action) => {
          switch (action?.room?.type) {
            case ERoomType.VOICE: {
              const selectedVoiceRoomId =
                this.voiceRoomService.selectedRoomId();
              if (selectedVoiceRoomId !== action.room.id) {
                this.voiceRoomService.joinRoom(action.room.id);
              }
              this.router.navigate([`/voice-room/${action.room.id}`]);
              break;
            }
            case ERoomType.TEXT: {
              this.router.navigate([`/text-room/${action.room.id}`]);
              break;
            }
            default:
              this.router.navigate(['/']);
          }
        }),
      ),
    { dispatch: false },
  );

  readonly requestRooms$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomsActions.requestRooms),
      switchMap(() =>
        this.roomsApiService.list().pipe(
          map((rooms) => RoomsActions.requestRoomsSuccess({ rooms })),
          catchError((error) => of(RoomsActions.requestRoomsError({ error }))),
        ),
      ),
    ),
  );

  readonly requestRoom$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomsActions.requestRoom),
      switchMap((action) =>
        this.roomsApiService.read(action.id).pipe(
          map((room) => RoomsActions.requestRoomSuccess({ room })),
          catchError((error) => of(RoomsActions.requestRoomError({ error }))),
        ),
      ),
    ),
  );

  readonly requestCreateRoom$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomsActions.requestCreateRoom),
      switchMap((action) =>
        this.roomsApiService.create(action.room).pipe(
          map((room) => RoomsActions.requestCreateRoomSuccess({ room })),
          catchError((error) =>
            of(RoomsActions.requestCreateRoomError({ error })),
          ),
        ),
      ),
    ),
  );

  readonly requestUpdateRoom$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomsActions.requestUpdateRoom),
      switchMap((action) =>
        this.roomsApiService.update(action.id, action.room).pipe(
          map((room) => RoomsActions.requestUpdateRoomSuccess({ room })),
          catchError((error) =>
            of(RoomsActions.requestUpdateRoomError({ error })),
          ),
        ),
      ),
    ),
  );

  readonly requestDeleteRoom$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomsActions.requestDeleteRoom),
      switchMap((action) =>
        this.roomsApiService.remove(action.id).pipe(
          map(() => RoomsActions.requestDeleteRoomSuccess({ id: action.id })),
          catchError((error) =>
            of(RoomsActions.requestDeleteRoomError({ error })),
          ),
        ),
      ),
    ),
  );

  readonly showError$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          RoomsActions.requestRoomError,
          RoomsActions.requestRoomsError,
          RoomsActions.requestCreateRoomError,
          RoomsActions.requestUpdateRoomError,
          RoomsActions.requestDeleteRoomError,
        ),
        tap(({ error }) => {
          this.tuiNotificationsService
            .open(parseError(error.message), {
              appearance: 'negative',
              autoClose: 5000,
              closable: true,
              label: this.translateService.instant('GENERAL.REQ_ERR'),
            })
            .subscribe();
        }),
      ),
    { dispatch: false },
  );
}
