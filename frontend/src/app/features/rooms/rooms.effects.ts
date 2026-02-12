import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { RoomsActions } from './rooms.actions';
import { catchError, map, of, switchMap, tap, withLatestFrom } from 'rxjs';
import { RoomsApiService } from './rooms-api.service';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '../../shared/functions/parse-error.function';
import { selectActiveVoiceChatId } from '../voice-chat/voice-chat.selectors';
import { VoiceChatActions } from '../voice-chat/voice-chat.actions';
import { ERoomType } from '@common/enums';

@Injectable()
export class RoomsEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly roomsApiService = inject(RoomsApiService);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);

  readonly selectRoom$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(RoomsActions.selectRoom),
        withLatestFrom(this.store.select(selectActiveVoiceChatId)),
        tap(([action, activeVoiceChat]) => {
          if (action?.room?.type == ERoomType.VOICE && action.room.id !== activeVoiceChat) {
            this.store.dispatch(VoiceChatActions.join({ id: action.room.id }));
          }
        }),
      ),
    { dispatch: false },
  );

  readonly requestRooms$ = createEffect(() =>
    this.actions$.pipe(
      ofType(RoomsActions.requestRooms),

      switchMap((action) =>
        this.roomsApiService.list().pipe(
          map((rooms) => RoomsActions.requestRoomsSuccess({ rooms })),
          catchError((error) => of(RoomsActions.requestRoomsError({ error }))),
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
          catchError((error) => of(RoomsActions.requestCreateRoomError({ error }))),
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
          catchError((error) => of(RoomsActions.requestUpdateRoomError({ error }))),
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
          catchError((error) => of(RoomsActions.requestDeleteRoomError({ error }))),
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
        tap((action) => {
          this.messageService.add({
            severity: 'error',
            summary: this.translateService.instant('GENERAL.REQ_ERR'),
            detail: parseError(action.error.message),
          });
        }),
      ),
    { dispatch: false },
  );
}
