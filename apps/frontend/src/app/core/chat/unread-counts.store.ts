import { socketReconnected$ } from '@shared/functions/socket-reconnected.function';
import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@core/auth/auth.selectors';
import {
  ETextRoomEvent,
  isMessageMentioningUser,
  ITextRoomMessage,
  ITextRoomUnreadCounts,
  IUser,
} from '@konvoez/shared';
import {
  patchState,
  signalStore,
  withComputed,
  withHooks,
  withMethods,
  withState,
} from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { Store } from '@ngrx/store';
import { catchError, EMPTY, fromEvent, pipe, switchMap, tap } from 'rxjs';
import { ChatApiService } from '@core/api/chat-api.service';

type UnreadCountsState = {
  rooms: Record<number, number>;
  roomMentions: Record<number, number>;
  direct: Record<number, number>;
  activeRoomId: number | null;
  activeRecipientId: number | null;
};

function parseCountMap(source: Record<string, number>): Record<number, number> {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [Number(key), value]),
  );
}

function incrementCount(
  map: Record<number, number>,
  key: number,
): Record<number, number> {
  return { ...map, [key]: (map[key] ?? 0) + 1 };
}

export const UnreadCountsStore = signalStore(
  { providedIn: 'root' },
  withState<UnreadCountsState>({
    rooms: {},
    roomMentions: {},
    direct: {},
    activeRoomId: null,
    activeRecipientId: null,
  }),
  withComputed(({ direct, rooms, activeRoomId, activeRecipientId }) => ({
    directTotal: computed(() =>
      Object.values(direct()).reduce((sum, count) => sum + count, 0),
    ),
    activeChatUnreadCount: computed(() => {
      const roomId = activeRoomId();
      if (roomId != null) {
        return rooms()[roomId] ?? 0;
      }
      const recipientId = activeRecipientId();
      if (recipientId != null) {
        return direct()[recipientId] ?? 0;
      }
      return 0;
    }),
  })),
  withMethods((store, chatApiService = inject(ChatApiService)) => {
    const applyCounts = ({
      rooms,
      roomMentions,
      direct,
    }: ITextRoomUnreadCounts): void => {
      patchState(store, {
        rooms: parseCountMap(rooms),
        roomMentions: parseCountMap(roomMentions ?? {}),
        direct: parseCountMap(direct),
      });
    };

    return {
      roomUnreadCount(roomId: number): number {
        return store.rooms()[roomId] ?? 0;
      },

      roomMentionCount(roomId: number): number {
        return store.roomMentions()[roomId] ?? 0;
      },

      directUnreadCount(userId: number): number {
        return store.direct()[userId] ?? 0;
      },

      chatUnreadCount(
        target:
          | { kind: 'room'; id: number }
          | { kind: 'direct'; id: number }
          | { roomId?: number | null; recipientId?: number | null }
          | null,
      ): number {
        if (!target) return 0;
        if ('kind' in target) {
          return target.kind === 'room'
            ? (store.rooms()[target.id] ?? 0)
            : (store.direct()[target.id] ?? 0);
        }
        if (target.roomId != null) {
          return store.rooms()[target.roomId] ?? 0;
        }
        if (target.recipientId != null) {
          return store.direct()[target.recipientId] ?? 0;
        }
        return 0;
      },

      applyCounts,

      setActiveChat({
        roomId,
        recipientId,
      }: {
        roomId: number | null;
        recipientId: number | null;
      }): void {
        patchState(store, {
          activeRoomId: roomId,
          activeRecipientId: recipientId,
        });
      },

      clearActiveChat(): void {
        patchState(store, {
          activeRoomId: null,
          activeRecipientId: null,
        });
      },

      handleNewMessage(
        message: ITextRoomMessage,
        currentUser: Pick<IUser, 'id' | 'roles'> | number,
      ): void {
        const userObj =
          typeof currentUser === 'number'
            ? { id: currentUser, roles: [] }
            : currentUser;
        const currentUserId = userObj.id;

        if (message.senderId === currentUserId) {
          return;
        }

        if (message.roomId) {
          const isMentioned = isMessageMentioningUser(
            message.mentions,
            userObj,
          );

          patchState(store, {
            rooms: incrementCount(store.rooms(), message.roomId),
            ...(isMentioned
              ? {
                  roomMentions: incrementCount(
                    store.roomMentions(),
                    message.roomId,
                  ),
                }
              : {}),
          });
          return;
        }

        if (message.recipientId === currentUserId) {
          patchState(store, {
            direct: incrementCount(store.direct(), message.senderId),
          });
        }
      },

      load: rxMethod<void>(
        pipe(
          switchMap(() =>
            chatApiService.getUnreadCounts().pipe(
              tap((counts) => {
                applyCounts(counts);
              }),
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),
    };
  }),
  withHooks({
    onInit(store) {
      const ngrxStore = inject(Store);
      const socket = inject(TextRoomSocketToken);
      const currentUser = ngrxStore.selectSignal(selectCurrentUser);
      const emitter = socket as never;

      ngrxStore
        .select(selectIsAuthorized)
        .pipe(takeUntilDestroyed())
        .subscribe((isAuthorized) => {
          if (isAuthorized) {
            store.load();
          } else {
            patchState(store, {
              rooms: {},
              roomMentions: {},
              direct: {},
              activeRoomId: null,
              activeRecipientId: null,
            });
          }
        });

      const isAuthorized = ngrxStore.selectSignal(selectIsAuthorized);
      socketReconnected$(socket)
        .pipe(takeUntilDestroyed())
        .subscribe(() => {
          if (isAuthorized()) {
            store.load();
          }
        });

      fromEvent<ITextRoomMessage>(emitter, ETextRoomEvent.MESSAGE_CREATED)
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          const me = currentUser();
          if (!me) {
            return;
          }
          store.handleNewMessage(message, me);
        });

      fromEvent<ITextRoomUnreadCounts>(
        emitter,
        ETextRoomEvent.UNREAD_COUNTS_CHANGED,
      )
        .pipe(takeUntilDestroyed())
        .subscribe((counts) => {
          store.applyCounts(counts);
        });
    },
  }),
);
