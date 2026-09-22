import { computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@features/auth/auth.selectors';
import { ETextRoomEvent, ITextRoomMessage } from '@konvoez/shared';
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
import { TextRoomApiService } from './text-room-api.service';

type UnreadCountsState = {
  rooms: Record<number, number>;
  direct: Record<number, number>;
  activeRoomId: number | null;
  activeRecipientId: number | null;
};

function parseCountMap(
  source: Record<string, number>,
): Record<number, number> {
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
    direct: {},
    activeRoomId: null,
    activeRecipientId: null,
  }),
  withComputed(({ direct }) => ({
    directTotal: computed(() =>
      Object.values(direct()).reduce((sum, count) => sum + count, 0),
    ),
  })),
  withMethods(
    (store, textRoomApiService = inject(TextRoomApiService)) => ({
      roomUnreadCount(roomId: number): number {
        return store.rooms()[roomId] ?? 0;
      },

      directUnreadCount(userId: number): number {
        return store.direct()[userId] ?? 0;
      },

      setActiveChat({
        roomId,
        recipientId,
      }: {
        roomId: number | null;
        recipientId: number | null;
      }): void {
        const rooms = { ...store.rooms() };
        const direct = { ...store.direct() };

        if (roomId != null) {
          delete rooms[roomId];
        }

        if (recipientId != null) {
          delete direct[recipientId];
        }

        patchState(store, {
          activeRoomId: roomId,
          activeRecipientId: recipientId,
          rooms,
          direct,
        });
      },

      clearActiveChat(): void {
        patchState(store, {
          activeRoomId: null,
          activeRecipientId: null,
        });
      },

      handleNewMessage(message: ITextRoomMessage, currentUserId: number): void {
        if (message.senderId === currentUserId) {
          return;
        }

        if (message.roomId) {
          if (store.activeRoomId() === message.roomId) {
            return;
          }

          patchState(store, {
            rooms: incrementCount(store.rooms(), message.roomId),
          });
          return;
        }

        if (
          message.recipientId === currentUserId &&
          store.activeRecipientId() !== message.senderId
        ) {
          patchState(store, {
            direct: incrementCount(store.direct(), message.senderId),
          });
        }
      },

      load: rxMethod<void>(
        pipe(
          switchMap(() =>
            textRoomApiService.getUnreadCounts().pipe(
              tap(({ rooms, direct }) => {
                patchState(store, {
                  rooms: parseCountMap(rooms),
                  direct: parseCountMap(direct),
                });
              }),
              catchError(() => EMPTY),
            ),
          ),
        ),
      ),
    }),
  ),
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
              direct: {},
              activeRoomId: null,
              activeRecipientId: null,
            });
          }
        });

      fromEvent<ITextRoomMessage>(emitter, ETextRoomEvent.MESSAGE_CREATED)
        .pipe(takeUntilDestroyed())
        .subscribe((message) => {
          const me = currentUser()?.id;
          if (!me) {
            return;
          }
          store.handleNewMessage(message, me);
        });
    },
  }),
);
