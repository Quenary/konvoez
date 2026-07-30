import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TextRoomActions } from './text-room.actions';
import {
  catchError,
  EMPTY,
  finalize,
  map,
  of,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';
import { TextRoomApiService } from './text-room-api.service';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { selectIsAuthorized } from '../auth/auth.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomCommon } from '@konvoez/shared';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import {
  selectTextRoomSelectedId,
  selectTextRoomSelectedRecipientId,
  selectTextRoomNewestId,
  selectTextRoomOldestId,
} from './text-room.selectors';
import { TuiNotificationService } from '@taiga-ui/core';

const defaultChunkSize = 25;

@Injectable()
export class TextRoomEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly textRoomApiService = inject(TextRoomApiService);
  private readonly socket = inject(TextRoomSocketToken);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

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
  }

  readonly joinRoom$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TextRoomActions.join),
        tap(({ roomId, recipientId }) => {
          this.socket.emit(TextRoomCommon.EEvent.JOIN, {
            roomId,
            recipientId,
          });
          this.store.dispatch(
            TextRoomActions.requestList({
              data: {
                afterId: null,
                beforeId: null,
                limit: defaultChunkSize,
                roomId,
                recipientId,
              },
            }),
          );
        }),
      ),
    { dispatch: false },
  );

  readonly leaveRoom$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TextRoomActions.leave),
        tap(() => {
          this.socket.emit(TextRoomCommon.EEvent.LEAVE, {});
        }),
      ),
    { dispatch: false },
  );

  readonly requestNextPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.requestNextPage),
      withLatestFrom(
        this.store.select(selectTextRoomSelectedId),
        this.store.select(selectTextRoomSelectedRecipientId),
        this.store.select(selectTextRoomNewestId),
      ),
      switchMap(([_, roomId, recipientId, newestId]) => {
        if (!newestId) {
          return EMPTY;
        }
        return of(
          TextRoomActions.requestList({
            data: {
              afterId: newestId,
              beforeId: null,
              limit: defaultChunkSize,
              roomId,
              recipientId,
            },
          }),
        );
      }),
    ),
  );

  readonly requestPrevPage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.requestPrevPage),
      withLatestFrom(
        this.store.select(selectTextRoomSelectedId),
        this.store.select(selectTextRoomSelectedRecipientId),
        this.store.select(selectTextRoomOldestId),
      ),
      switchMap(([_, roomId, recipientId, oldestId]) => {
        if (!oldestId) {
          return EMPTY;
        }
        return of(
          TextRoomActions.requestList({
            data: {
              afterId: null,
              beforeId: oldestId,
              limit: defaultChunkSize,
              roomId,
              recipientId,
            },
          }),
        );
      }),
    ),
  );

  readonly requestList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.requestList),
      switchMap((action) =>
        this.textRoomApiService.list(action.data).pipe(
          map((data) => TextRoomActions.requestListSuccess({ data })),
          catchError((error) =>
            of(TextRoomActions.requestListError({ error })),
          ),
        ),
      ),
    ),
  );

  readonly createMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.createMessage),
      switchMap((action) =>
        this.textRoomApiService.create(action.data).pipe(
          map((data) =>
            TextRoomActions.createMessageSuccess({
              tempId: action.tempId,
              data,
            }),
          ),
          catchError((error) =>
            of(
              TextRoomActions.createMessageError({
                error,
                tempId: action.tempId,
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly updateMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.updateMessage),
      switchMap((action) =>
        this.textRoomApiService.update(action.messageId, action.data).pipe(
          map((data) =>
            TextRoomActions.updateMessageSuccess({
              data,
            }),
          ),
          catchError((error) =>
            of(
              TextRoomActions.updateMessageError({
                messageId: action.messageId,
                error,
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly deleteMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.deleteMessage),
      switchMap((action) =>
        this.textRoomApiService.delete(action.messageId).pipe(
          map(() =>
            TextRoomActions.deleteMessageSuccess({
              messageId: action.messageId,
            }),
          ),
          catchError((error) =>
            of(
              TextRoomActions.deleteMessageError({
                messageId: action.messageId,
                error,
              }),
            ),
          ),
        ),
      ),
    ),
  );

  readonly showError$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(
          TextRoomActions.requestListError,
          TextRoomActions.createMessageError,
          TextRoomActions.updateMessageError,
          TextRoomActions.deleteMessageError,
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
