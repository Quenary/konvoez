import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { selectIsAuthorized } from '@features/auth/auth.selectors';
import {
  ETextRoomEvent,
  ITextRoomCreateMessage,
  ITextRoomEditMessage,
  ITextRoomListRequest,
  ITextRoomMessage,
} from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import {
  addEntity,
  removeAllEntities,
  removeEntity,
  setEntities,
  setEntity,
  updateEntity,
  withEntities,
} from '@ngrx/signals/entities';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { parseError } from '@shared/functions/parse-error.function';
import { TuiNotificationService } from '@taiga-ui/core';
import {
  catchError,
  EMPTY,
  finalize,
  fromEvent,
  pipe,
  switchMap,
  tap,
} from 'rxjs';
import { TextRoomApiService } from './text-room-api.service';

const defaultChunkSize = 25;

export enum EMessageStatus {
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface IMessageEntity extends ITextRoomMessage {
  status: EMessageStatus;
}

type TextRoomState = {
  selectedRoomId: number | null;
  selectedRecipientId: number | null;
  editableMessageId: string | null;
};

function toMessageEntity(
  message: ITextRoomMessage,
  status: EMessageStatus = EMessageStatus.SUCCESS,
): IMessageEntity {
  return {
    ...message,
    createdAt: new Date(message.createdAt),
    updatedAt: message.updatedAt ? new Date(message.updatedAt) : null,
    status,
  };
}

export const TextRoomStore = signalStore(
  { providedIn: 'root' },
  withState<TextRoomState>({
    selectedRoomId: null,
    selectedRecipientId: null,
    editableMessageId: null,
  }),
  withEntities<IMessageEntity>(),
  withComputed(({ entities, editableMessageId, entityMap }) => {
    const messages = computed(() =>
      [...entities()].sort(
        (a, b) => a.createdAt.valueOf() - b.createdAt.valueOf(),
      ),
    );

    return {
      messages,
      editableMessage: computed(() => {
        const id = editableMessageId();
        return id ? (entityMap()[id] ?? null) : null;
      }),
      newestId: computed(() => {
        const list = messages();
        return list.at(-1)?.id ?? null;
      }),
      oldestId: computed(() => {
        const list = messages();
        return list.at(0)?.id ?? null;
      }),
    };
  }),
  withMethods(
    (
      store,
      textRoomApiService = inject(TextRoomApiService),
      socket = inject(TextRoomSocketToken),
      translateService = inject(TranslateService),
      tuiNotificationsService = inject(TuiNotificationService),
    ) => {
      const showError = (error: unknown): void => {
        tuiNotificationsService
          .open(parseError(error), {
            appearance: 'negative',
            autoClose: 5000,
            closable: true,
            label: translateService.instant('GENERAL.REQ_ERR'),
          })
          .subscribe();
      };

      const requestList = rxMethod<ITextRoomListRequest>(
        pipe(
          switchMap((data) =>
            textRoomApiService.list(data).pipe(
              tap(({ items }) => {
                patchState(
                  store,
                  setEntities(items.map((item) => toMessageEntity(item))),
                );
              }),
              catchError((error) => {
                showError(error);
                return EMPTY;
              }),
            ),
          ),
        ),
      );

      return {
        join({
          roomId,
          recipientId,
        }: {
          roomId: number | null;
          recipientId: number | null;
        }): void {
          patchState(store, removeAllEntities(), {
            selectedRoomId: roomId,
            selectedRecipientId: recipientId,
            editableMessageId: null,
          });
          socket.emit(ETextRoomEvent.JOIN, { roomId, recipientId });
          requestList({
            afterId: null,
            beforeId: null,
            limit: defaultChunkSize,
            roomId,
            recipientId,
          });
        },

        leave(): void {
          socket.emit(ETextRoomEvent.LEAVE, {});
          patchState(store, removeAllEntities(), {
            selectedRoomId: null,
            selectedRecipientId: null,
            editableMessageId: null,
          });
        },

        requestNextPage(): void {
          const newestId = store.newestId();
          if (!newestId) {
            return;
          }
          requestList({
            afterId: newestId,
            beforeId: null,
            limit: defaultChunkSize,
            roomId: store.selectedRoomId(),
            recipientId: store.selectedRecipientId(),
          });
        },

        requestPrevPage(): void {
          const oldestId = store.oldestId();
          if (!oldestId) {
            return;
          }
          requestList({
            afterId: null,
            beforeId: oldestId,
            limit: defaultChunkSize,
            roomId: store.selectedRoomId(),
            recipientId: store.selectedRecipientId(),
          });
        },

        setEditableMessageId(id: string | null): void {
          patchState(store, { editableMessageId: id });
        },

        createMessage: rxMethod<{
          tempId: string;
          data: ITextRoomCreateMessage;
        }>(
          pipe(
            tap(({ tempId, data }) => {
              const optimistic: IMessageEntity = {
                ...data,
                id: tempId,
                senderId: 0,
                senderUsername: '',
                createdAt: new Date(),
                updatedAt: null,
                status: EMessageStatus.LOADING,
              };
              patchState(store, addEntity(optimistic));
            }),
            switchMap(({ tempId, data }) =>
              textRoomApiService.create(data).pipe(
                tap((message) => {
                  patchState(
                    store,
                    removeEntity(tempId),
                    setEntity(toMessageEntity(message)),
                  );
                }),
                catchError((error) => {
                  patchState(
                    store,
                    updateEntity({
                      id: tempId,
                      changes: { status: EMessageStatus.ERROR },
                    }),
                  );
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        updateMessage: rxMethod<{
          messageId: string;
          data: ITextRoomEditMessage;
        }>(
          pipe(
            tap(({ messageId }) => {
              patchState(
                store,
                updateEntity({
                  id: messageId,
                  changes: { status: EMessageStatus.LOADING },
                }),
              );
            }),
            switchMap(({ messageId, data }) =>
              textRoomApiService.update(messageId, data).pipe(
                tap((message) => {
                  patchState(store, setEntity(toMessageEntity(message)), {
                    editableMessageId: null,
                  });
                }),
                catchError((error) => {
                  patchState(
                    store,
                    updateEntity({
                      id: messageId,
                      changes: { status: EMessageStatus.ERROR },
                    }),
                  );
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),

        deleteMessage: rxMethod<string>(
          pipe(
            tap((messageId) => {
              patchState(
                store,
                updateEntity({
                  id: messageId,
                  changes: { status: EMessageStatus.LOADING },
                }),
              );
            }),
            switchMap((messageId) =>
              textRoomApiService.delete(messageId).pipe(
                tap(() => {
                  patchState(store, removeEntity(messageId));
                }),
                catchError((error) => {
                  patchState(
                    store,
                    updateEntity({
                      id: messageId,
                      changes: { status: EMessageStatus.ERROR },
                    }),
                  );
                  showError(error);
                  return EMPTY;
                }),
              ),
            ),
          ),
        ),
      };
    },
  ),
  withHooks({
    onInit(store) {
      const ngrxStore = inject(Store);
      const socket = inject(TextRoomSocketToken);
      // socket.io typed Emitter ≠ RxJS fromEvent overloads
      const emitter = socket as never;

      ngrxStore
        .select(selectIsAuthorized)
        .pipe(
          takeUntilDestroyed(),
          finalize(() => socket.disconnect()),
        )
        .subscribe((isAuthorized) => {
          if (isAuthorized) {
            socket.connect();
          } else {
            socket.disconnect();
          }
        });

      fromEvent<ITextRoomMessage>(emitter, ETextRoomEvent.MESSAGE_CREATED)
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          patchState(store, setEntity(toMessageEntity(message)));
        });

      fromEvent<ITextRoomMessage>(emitter, ETextRoomEvent.MESSAGE_EDITED)
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          patchState(store, setEntity(toMessageEntity(message)));
        });

      fromEvent<{ id: string }>(emitter, ETextRoomEvent.MESSAGE_DELETED)
        .pipe(takeUntilDestroyed())
        .subscribe(({ id }) => {
          patchState(store, removeEntity(id));
        });
    },
  }),
);
