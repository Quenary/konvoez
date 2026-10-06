import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { selectCurrentUser } from '@features/auth/auth.selectors';
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
import { catchError, EMPTY, fromEvent, pipe, switchMap, tap } from 'rxjs';
import { TextRoomApiService } from '@core/chat/text-room-api.service';
import { MessageReadQueueService } from '@core/chat/message-read-queue.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { OutgoingMessagesStore } from '@core/chat/outgoing/outgoing-messages.store';
import {
  ILocalFile,
  IOutgoingMessage,
} from '@core/chat/outgoing/outgoing.types';
import {
  ChatTarget,
  chatTargetToApiIds,
  messageBelongsToChat,
} from './chat-target';

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

type ChatState = {
  target: ChatTarget | null;
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

/**
 * Open chat session state. Provide on ChatComponent — not root.
 */
export const ChatStore = signalStore(
  withState<ChatState>({
    target: null,
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
        target,
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
        const activeTarget = target();
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
              messageBelongsToChat(
                {
                  roomId: message.data.roomId ?? null,
                  recipientId: message.data.recipientId ?? null,
                  senderId: user?.id ?? 0,
                },
                activeTarget,
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

      const apiIds = () => chatTargetToApiIds(store.target());

      return {
        join(target: ChatTarget): void {
          const { roomId, recipientId } = chatTargetToApiIds(target);
          messageReadQueueService.reset();
          unreadCountsStore.setActiveChat({ roomId, recipientId });
          patchState(store, removeAllEntities(), {
            target,
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
          if (store.target() === null) {
            return;
          }
          messageReadQueueService.reset();
          unreadCountsStore.clearActiveChat();
          unreadCountsStore.load();
          socket.emit(ETextRoomEvent.LEAVE, {});
          patchState(store, removeAllEntities(), {
            target: null,
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
          const { roomId, recipientId } = apiIds();
          patchState(store, removeAllEntities(), { searchQuery: trimmed });
          requestList({
            afterId: null,
            beforeId: null,
            limit: defaultChunkSize,
            roomId,
            recipientId,
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
            const { roomId, recipientId } = apiIds();
            patchState(store, removeAllEntities());
            requestList({
              afterId: null,
              beforeId: null,
              limit: defaultChunkSize,
              roomId,
              recipientId,
            });
          }
        },

        requestNextPage(): void {
          const newestId = store.newestId();
          if (!newestId) {
            return;
          }
          const { roomId, recipientId } = apiIds();
          requestList({
            afterId: newestId,
            beforeId: null,
            limit: defaultChunkSize,
            roomId,
            recipientId,
            search: store.searchQuery() || undefined,
          });
        },

        requestPrevPage(): void {
          const oldestId = store.oldestId();
          if (!oldestId) {
            return;
          }
          const { roomId, recipientId } = apiIds();
          requestList({
            afterId: null,
            beforeId: oldestId,
            limit: defaultChunkSize,
            roomId,
            recipientId,
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

              const { roomId, recipientId } = apiIds();
              return textRoomApiService
                .list({
                  roomId,
                  recipientId,
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
      const socket = inject(TextRoomSocketToken);
      const emitter = socket as never;
      const outgoingStore = inject(OutgoingMessagesStore);

      const belongsToActiveChat = (message: ITextRoomMessage): boolean =>
        messageBelongsToChat(message, store.target());

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
    onDestroy(store) {
      store.leave();
    },
  }),
);
