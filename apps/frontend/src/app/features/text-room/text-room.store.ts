import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@features/auth/auth.selectors';
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
  removeAllEntities,
  removeEntity,
  setEntities,
  setEntity,
  updateEntities,
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
import { MessageReadQueueService } from './message-read-queue.service';
import { UnreadCountsStore } from './unread-counts.store';
import { OutgoingMessagesStore } from './outgoing/outgoing-messages.store';
import { ILocalFile, IOutgoingMessage } from './outgoing/outgoing.types';

const defaultChunkSize = 25;

export enum EMessageStatus {
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface IMessageEntity extends ITextRoomMessage {
  status: EMessageStatus;
  /** Optimistic create not yet confirmed by the server */
  isPendingCreate?: boolean;
  outgoing?: IOutgoingMessage;
}

type TextRoomState = {
  selectedRoomId: number | null;
  selectedRecipientId: number | null;
  editableMessageId: string | null;
  replyToMessageId: string | null;
  targetScrollMessageId: string | null;
  searchQuery: string | null;
  isSearchOpen: boolean;
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

function toOutgoingMessageEntity(
  message: IOutgoingMessage,
  userId: number,
  username: string,
): IMessageEntity {
  const failed = message.state.phase === 'failed';
  return {
    id: message.tempId,
    senderId: userId,
    senderUsername: username,
    roomId: message.data.roomId ?? null,
    recipientId: message.data.recipientId ?? null,
    content: message.data.content,
    createdAt: message.createdAt,
    updatedAt: null,
    isRead: false,
    attachments: message.files.flatMap((file) =>
      file.state.status === 'uploaded' ? [file.state.attachment] : [],
    ),
    clientId: message.tempId,
    replyTo: message.replyTo,
    status: failed ? EMessageStatus.ERROR : EMessageStatus.LOADING,
    isPendingCreate: true,
    outgoing: message,
  };
}

function messageBelongsToActiveChat(
  message: Pick<ITextRoomMessage, 'roomId' | 'recipientId' | 'senderId'>,
  selectedRoomId: number | null,
  selectedRecipientId: number | null,
): boolean {
  if (selectedRoomId != null) {
    return message.roomId === selectedRoomId;
  }

  if (selectedRecipientId != null) {
    return (
      message.roomId === null &&
      (message.senderId === selectedRecipientId ||
        message.recipientId === selectedRecipientId)
    );
  }

  return false;
}

export const TextRoomStore = signalStore(
  { providedIn: 'root' },
  withState<TextRoomState>({
    selectedRoomId: null,
    selectedRecipientId: null,
    editableMessageId: null,
    replyToMessageId: null,
    targetScrollMessageId: null,
    searchQuery: null,
    isSearchOpen: false,
  }),
  withEntities<IMessageEntity>(),
  withComputed(
    (
      {
        entities,
        editableMessageId,
        replyToMessageId,
        entityMap,
        searchQuery,
        selectedRoomId,
        selectedRecipientId,
      },
      outgoingStore = inject(OutgoingMessagesStore),
      ngrxStore = inject(Store),
    ) => {
      const currentUser = ngrxStore.selectSignal(selectCurrentUser);
      const serverMessages = computed(() =>
        [...entities()].sort(
          (a, b) => a.createdAt.valueOf() - b.createdAt.valueOf(),
        ),
      );
      const isSearchActive = computed(() => Boolean(searchQuery()?.trim()));
      const messages = computed(() => {
        const server = serverMessages();
        const searching = isSearchActive();
        const roomId = selectedRoomId();
        const recipientId = selectedRecipientId();
        const outgoingMessages = outgoingStore.entities();
        const user = currentUser();
        if (searching) {
          return server;
        }
        const knownClientIds = new Set(
          server.flatMap((message) =>
            message.clientId ? [message.clientId] : [],
          ),
        );
        const outgoing = outgoingMessages
          .filter(
            (message) =>
              messageBelongsToActiveChat(
                {
                  roomId: message.data.roomId ?? null,
                  recipientId: message.data.recipientId ?? null,
                  senderId: user?.id ?? 0,
                },
                roomId,
                recipientId,
              ) && !knownClientIds.has(message.tempId),
          )
          .map((message) =>
            toOutgoingMessageEntity(
              message,
              user?.id ?? 0,
              user?.username ?? '',
            ),
          );
        return [...server, ...outgoing].sort(
          (a, b) => a.createdAt.valueOf() - b.createdAt.valueOf(),
        );
      });

      return {
        messages,
        isSearchActive,
        editableMessage: computed(() => {
          const id = editableMessageId();
          return id ? (entityMap()[id] ?? null) : null;
        }),
        replyToMessage: computed(() => {
          const id = replyToMessageId();
          return id ? (entityMap()[id] ?? null) : null;
        }),
        newestId: computed(() => serverMessages().at(-1)?.id ?? null),
        oldestId: computed(() => serverMessages().at(0)?.id ?? null),
      };
    },
  ),
  withMethods(
    (
      store,
      textRoomApiService = inject(TextRoomApiService),
      socket = inject(TextRoomSocketToken),
      translateService = inject(TranslateService),
      tuiNotificationsService = inject(TuiNotificationService),
      messageReadQueueService = inject(MessageReadQueueService),
      unreadCountsStore = inject(UnreadCountsStore),
      outgoingStore = inject(OutgoingMessagesStore),
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
          messageReadQueueService.reset();
          unreadCountsStore.setActiveChat({ roomId, recipientId });
          patchState(store, removeAllEntities(), {
            selectedRoomId: roomId,
            selectedRecipientId: recipientId,
            editableMessageId: null,
            replyToMessageId: null,
            targetScrollMessageId: null,
            searchQuery: null,
            isSearchOpen: false,
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
          messageReadQueueService.reset();
          unreadCountsStore.clearActiveChat();
          unreadCountsStore.load();
          socket.emit(ETextRoomEvent.LEAVE, {});
          patchState(store, removeAllEntities(), {
            selectedRoomId: null,
            selectedRecipientId: null,
            editableMessageId: null,
            replyToMessageId: null,
            targetScrollMessageId: null,
            searchQuery: null,
            isSearchOpen: false,
          });
        },

        setSearchQuery(query: string | null): void {
          const trimmed = query?.trim() || null;
          if (store.searchQuery() === trimmed) {
            return;
          }
          patchState(store, removeAllEntities(), { searchQuery: trimmed });
          requestList({
            afterId: null,
            beforeId: null,
            limit: defaultChunkSize,
            roomId: store.selectedRoomId(),
            recipientId: store.selectedRecipientId(),
            search: trimmed || undefined,
          });
        },

        setSearchOpen(open: boolean): void {
          if (store.isSearchOpen() === open) {
            return;
          }
          if (!open) {
            patchState(store, { isSearchOpen: false });
            this.clearSearch();
          } else {
            patchState(store, { isSearchOpen: true });
          }
        },

        clearSearch(): void {
          const wasSearching = Boolean(store.searchQuery()?.trim());
          patchState(store, { searchQuery: null });
          if (wasSearching) {
            patchState(store, removeAllEntities());
            requestList({
              afterId: null,
              beforeId: null,
              limit: defaultChunkSize,
              roomId: store.selectedRoomId(),
              recipientId: store.selectedRecipientId(),
            });
          }
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
            search: store.searchQuery() || undefined,
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
            search: store.searchQuery() || undefined,
          });
        },

        setEditableMessageId(id: string | null): void {
          patchState(store, {
            editableMessageId: id,
            ...(id ? { replyToMessageId: null } : {}),
          });
        },

        setReplyToMessageId(id: string | null): void {
          patchState(store, {
            replyToMessageId: id,
            ...(id ? { editableMessageId: null } : {}),
          });
        },

        setTargetScrollMessageId(id: string | null): void {
          patchState(store, { targetScrollMessageId: id });
        },

        jumpToMessage: rxMethod<string>(
          pipe(
            switchMap((messageId) => {
              const existing = store.entityMap()[messageId];
              if (existing) {
                patchState(store, { targetScrollMessageId: messageId });
                return EMPTY;
              }

              return textRoomApiService
                .list({
                  roomId: store.selectedRoomId(),
                  recipientId: store.selectedRecipientId(),
                  aroundId: messageId,
                  beforeId: null,
                  afterId: null,
                  limit: defaultChunkSize,
                })
                .pipe(
                  tap(({ items }) => {
                    if (items.length === 0) {
                      tuiNotificationsService
                        .open(
                          translateService.instant(
                            'ROOMS.ORIGINAL_MESSAGE_DELETED',
                          ),
                          { appearance: 'info', autoClose: 3000 },
                        )
                        .subscribe();
                      return;
                    }
                    patchState(
                      store,
                      setEntities(items.map((item) => toMessageEntity(item))),
                      { targetScrollMessageId: messageId },
                    );
                  }),
                  catchError((error) => {
                    showError(error);
                    return EMPTY;
                  }),
                );
            }),
          ),
        ),

        createMessage({
          tempId,
          data,
          files = [],
        }: {
          tempId: string;
          data: ITextRoomCreateMessage;
          files?: readonly ILocalFile[];
        }): void {
          const replyTarget = data.replyToId
            ? store.entityMap()[data.replyToId]
            : null;
          outgoingStore.send({
            tempId,
            data,
            files,
            replyTo: replyTarget
              ? {
                  id: replyTarget.id,
                  senderId: replyTarget.senderId,
                  senderUsername: replyTarget.senderUsername,
                  content: replyTarget.content,
                  isDeleted: false,
                }
              : null,
          });
          patchState(store, { replyToMessageId: null });
        },

        retryMessage(id: string): void {
          outgoingStore.retry(id);
        },

        cancelOutgoing(id: string): void {
          outgoingStore.cancel(id);
        },

        removeOutgoingFile(id: string, localId: string): void {
          outgoingStore.removeFile(id, localId);
        },

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

      const belongsToActiveChat = (message: ITextRoomMessage): boolean =>
        messageBelongsToActiveChat(
          message,
          store.selectedRoomId(),
          store.selectedRecipientId(),
        );

      const outgoingStore = inject(OutgoingMessagesStore);

      outgoingStore.messageCreated$
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          if (store.searchQuery()?.trim()) {
            return;
          }
          if (!belongsToActiveChat(message)) {
            return;
          }
          patchState(store, setEntity(toMessageEntity(message)));
        });

      fromEvent<ITextRoomMessage>(emitter, ETextRoomEvent.MESSAGE_CREATED)
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          if (message.clientId) {
            outgoingStore.resolve(message);
          }
          // Ignore incoming new messages when search is active to keep search results consistent
          if (store.searchQuery()?.trim()) {
            return;
          }
          if (!belongsToActiveChat(message)) {
            return;
          }
          patchState(store, setEntity(toMessageEntity(message)));
        });

      fromEvent<ITextRoomMessage>(emitter, ETextRoomEvent.MESSAGE_EDITED)
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          if (!belongsToActiveChat(message)) {
            return;
          }
          patchState(store, setEntity(toMessageEntity(message)));
        });

      fromEvent<{ id: string }>(emitter, ETextRoomEvent.MESSAGE_DELETED)
        .pipe(takeUntilDestroyed())
        .subscribe(({ id }) => {
          if (!store.entityMap()[id]) {
            return;
          }
          patchState(
            store,
            removeEntity(id),
            updateEntities({
              predicate: (m) => m.replyTo?.id === id,
              changes: (m) => ({
                replyTo: m.replyTo
                  ? {
                      ...m.replyTo,
                      isDeleted: true,
                      content: null,
                      senderId: null,
                      senderUsername: null,
                    }
                  : null,
              }),
            }),
          );
        });
    },
  }),
);
