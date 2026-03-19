import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { TextRoomActions } from './text-room.actions';
import {
  catchError,
  finalize,
  map,
  mergeMap,
  of,
  switchMap,
  tap,
  withLatestFrom,
} from 'rxjs';
import { TextRoomApiService } from './text-room-api.service';
import { TextRoomSocketToken } from '../../core/tokens/text-room-socket.token';
import { selectIsAuthorized } from '../auth/auth.selectors';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomCommon } from '@common/text-room';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '../../shared/functions/parse-error.function';
import {
  selectTextRoomAvatars,
  selectTextRoomCurrentPage,
  selectTextRoomLoadedPages,
  selectTextRoomSelectedId,
  selectTextRoomSelectedRecipientId,
  selectTextRoomState,
  selectTextRoomTotalPages,
} from './text-room.selectors';
import { AvatarsApiService } from '../avatars/avatars-api.service';

const defaultPageSize = 25;

@Injectable()
export class TextRoomEffects {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly textRoomApiService = inject(TextRoomApiService);
  private readonly socket = inject(TextRoomSocketToken);
  private readonly messageService = inject(MessageService);
  private readonly translateService = inject(TranslateService);
  private readonly avatarsApiService = inject(AvatarsApiService);

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
        tap((action) => {
          this.socket.emit(TextRoomCommon.EEvent.JOIN, {
            roomId: action.roomId,
            recipientId: action.recipientId,
          });
        }),
      ),
    { dispatch: false },
  );

  readonly leaveRoom$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TextRoomActions.leave),
        tap((action) => {
          this.socket.emit(TextRoomCommon.EEvent.LEAVE, {});
        }),
      ),
    { dispatch: false },
  );

  readonly requestNextPage$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TextRoomActions.requestNextPage),
        withLatestFrom(
          this.store.select(selectTextRoomSelectedId),
          this.store.select(selectTextRoomSelectedRecipientId),
          this.store.select(selectTextRoomCurrentPage),
          this.store.select(selectTextRoomTotalPages),
        ),
        tap(([_, roomId, recipientId, currentPage, totalPages]) => {
          const pageNumber = (currentPage ?? 0) + 1;
          if (totalPages && pageNumber > totalPages) {
            return;
          }

          const pageSize = defaultPageSize;
          const data: TextRoomCommon.IListRequest = {
            pageNumber,
            pageSize,
            roomId,
            recipientId,
          };
          this.store.dispatch(TextRoomActions.requestList({ data }));
        }),
      ),
    { dispatch: false },
  );

  readonly requestPrevPage$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TextRoomActions.requestPrevPage),
        withLatestFrom(
          this.store.select(selectTextRoomSelectedId),
          this.store.select(selectTextRoomSelectedRecipientId),
          this.store.select(selectTextRoomCurrentPage),
          this.store.select(selectTextRoomLoadedPages),
        ),
        tap(([_, roomId, recipientId, currentPage, loadedPages]) => {
          const pageNumber = Math.max(1, (currentPage ?? 0) - 1);
          if (loadedPages.includes(pageNumber)) {
            return;
          }
          const pageSize = defaultPageSize;
          const data: TextRoomCommon.IListRequest = {
            pageNumber,
            pageSize,
            roomId,
            recipientId,
          };
          this.store.dispatch(TextRoomActions.requestList({ data }));
        }),
      ),
    { dispatch: false },
  );

  readonly requestList$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.requestList),
      switchMap((action) =>
        this.textRoomApiService.list(action.data).pipe(
          map((data) =>
            TextRoomActions.requestListSuccess({ data, req: action.data }),
          ),
          catchError((error) =>
            of(TextRoomActions.requestListError({ error })),
          ),
        ),
      ),
    ),
  );

  readonly requestListSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(TextRoomActions.requestListSuccess),
        withLatestFrom(this.store.select(selectTextRoomAvatars)),
        tap(([action, avatars]) => {
          const userIds = [
            ...new Set(action.data.items.map((item) => item.senderId)),
          ].filter((senderId) => !avatars[senderId]);
          userIds.forEach((userId) => {
            this.store.dispatch(TextRoomActions.requestAvatar({ userId }));
          });
        }),
      ),
    { dispatch: false },
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

  readonly editMessage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.editMessage),
      switchMap((action) =>
        this.textRoomApiService.edit(action.messageId, action.data).pipe(
          map((data) =>
            TextRoomActions.editMessageSuccess({
              data,
            }),
          ),
          catchError((error) =>
            of(
              TextRoomActions.editMessageError({
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
          map((data) =>
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

  readonly requestAvatar$ = createEffect(() =>
    this.actions$.pipe(
      ofType(TextRoomActions.requestAvatar),
      mergeMap(({ userId }) =>
        this.avatarsApiService.getUrlByUserId(userId).pipe(
          map((avatar) =>
            TextRoomActions.requestAvatarSuccess({ userId, avatar }),
          ),
          catchError((error) =>
            of(TextRoomActions.requestAvatarError({ error })),
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
          TextRoomActions.editMessageError,
          TextRoomActions.deleteMessageError,
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
