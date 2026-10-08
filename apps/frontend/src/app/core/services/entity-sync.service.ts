import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import {
  EEntitySyncEvent,
  EVoiceRoomEvent,
  type IRoom,
  type IRoomDeleted,
  type IUser,
  type IUserDeleted,
  type IVoiceRoomGetAllPeersSnapshot,
  type IVoiceRoomLobbyPeerJoined,
  type IVoiceRoomLobbyPeerLeft,
} from '@konvoez/shared';
import { EntitySyncSocketToken } from '@core/tokens/entity-sync-socket.token';
import { VoiceRoomSocketToken } from '@core/tokens/voice-room-socket.token';
import {
  TVoiceLobbyIncrementalResult,
  VoiceLobbyStore,
} from '@core/voice/voice-lobby.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { AuthActions } from '@core/auth/auth.actions';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@core/auth/auth.selectors';
import { RoomsStore } from '@core/stores/rooms.store';
import { UsersStore } from '@core/stores/users.store';
import { emitVoiceRoomWithAck } from '@core/services/voice-room-socket-ack';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { Mutex } from 'async-mutex';
import {
  EMPTY,
  filter,
  finalize,
  fromEvent,
  map,
  merge,
  startWith,
  switchMap,
  tap,
  timer,
  withLatestFrom,
} from 'rxjs';

/**
 * Process-wide mutex protecting lobby snapshot loading against concurrent fetches.
 * Required at module level by `@Mutexed`; shared across all instances (including test instances).
 */
export const lobbyResyncMutex = new Mutex();
const LOBBY_RESYNC_MAX_ATTEMPTS = 3;
const LOBBY_RESYNC_INTERVAL_MS = 60_000;
const LOBBY_SNAPSHOT_BACKOFF_MS = [1000, 2000] as const;

/**
 * Keeps the entity-sync socket connected for the app lifetime and mirrors
 * server entity changes into feature stores (and auth when the current user changes).
 */
@Injectable({ providedIn: 'root' })
export class EntitySyncService {
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);
  private readonly socket = inject(EntitySyncSocketToken);
  private readonly voiceRoomSocket = inject(VoiceRoomSocketToken);
  private readonly usersStore = inject(UsersStore);
  private readonly roomsStore = inject(RoomsStore);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly emitter = this.socket as never;
  private readonly voiceRoomEmitter = this.voiceRoomSocket as never;
  private isLobbyResyncQueued = false;

  constructor() {
    this.bindAuthConnection();
    this.bindUserEvents();
    this.bindRoomEvents();
    this.bindVoiceLobbyEvents();
    this.bindVoiceLobbySync();
  }

  private bindAuthConnection(): void {
    this.store
      .select(selectIsAuthorized)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.socket.disconnect();
        }),
      )
      .subscribe((isAuthorized) => {
        if (isAuthorized) {
          this.socket.connect();
        } else {
          this.socket.disconnect();
          this.voiceLobbyStore.reset();
        }
      });
  }

  private bindUserEvents(): void {
    fromEvent<IUser>(this.emitter, EEntitySyncEvent.USER_CREATED)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => {
        this.usersStore.upsertOne(user);
      });

    fromEvent<IUser>(this.emitter, EEntitySyncEvent.USER_UPDATED)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap((user) => {
          this.usersStore.upsertOne(user);
          this.voiceSessionStore.applyUserEntityUpdate(user);
          this.voiceLobbyStore.applyUserEntityUpdate(user);
        }),
        withLatestFrom(this.store.select(selectCurrentUser)),
        filter(([user, currentUser]) => currentUser?.id === user.id),
      )
      .subscribe(([user]) => {
        this.store.dispatch(AuthActions.requestPatchUserSuccess({ user }));
      });

    fromEvent<IUserDeleted>(this.emitter, EEntitySyncEvent.USER_DELETED)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(({ id }) => {
          this.usersStore.removeOne(id);
          this.voiceSessionService.applyUserEntityDeleted(id);
          this.voiceLobbyStore.applyUserEntityDeleted(id);
        }),
        withLatestFrom(this.store.select(selectCurrentUser)),
        filter(([{ id }, currentUser]) => currentUser?.id === id),
      )
      .subscribe(() => {
        this.store.dispatch(AuthActions.requestLogout());
      });
  }

  private bindRoomEvents(): void {
    fromEvent<IRoom>(this.emitter, EEntitySyncEvent.ROOM_CREATED)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((room) => {
        this.roomsStore.upsertOne(room);
      });

    fromEvent<IRoom>(this.emitter, EEntitySyncEvent.ROOM_UPDATED)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((room) => {
        this.roomsStore.upsertOne(room);
      });

    fromEvent<IRoomDeleted>(this.emitter, EEntitySyncEvent.ROOM_DELETED)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ id }) => {
        this.roomsStore.removeOne(id);
      });
  }

  private bindVoiceLobbySync(): void {
    merge(
      fromEvent(this.emitter, 'connect'),
      fromEvent(this.voiceRoomEmitter, 'connect'),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.resyncLobbyState();
      });

    merge(
      fromEvent(this.emitter, 'disconnect'),
      fromEvent(this.voiceRoomEmitter, 'disconnect'),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.voiceLobbyStore.markUnsynced();
      });

    if (this.voiceRoomSocket.connected) {
      void this.resyncLobbyState();
    }

    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.resyncLobbyState();
      });

    fromEvent(document, 'visibilitychange')
      .pipe(
        startWith(undefined),
        map(() => document.visibilityState === 'visible'),
        switchMap((visible, index) =>
          visible
            ? timer(
                index === 0 ? LOBBY_RESYNC_INTERVAL_MS : 0,
                LOBBY_RESYNC_INTERVAL_MS,
              )
            : EMPTY,
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        void this.resyncLobbyState();
      });
  }

  private bindVoiceLobbyEvents(): void {
    fromEvent<IVoiceRoomLobbyPeerJoined>(
      this.emitter,
      EEntitySyncEvent.VOICE_ROOM_PEER_JOINED,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        const result = this.voiceLobbyStore.applyVoicePeerJoined(payload);
        this.handleLobbyIncrementalResult(result);
      });

    fromEvent<IVoiceRoomLobbyPeerLeft>(
      this.emitter,
      EEntitySyncEvent.VOICE_ROOM_PEER_LEFT,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        const result = this.voiceLobbyStore.applyVoicePeerLeft(payload);
        this.handleLobbyIncrementalResult(result);
      });
  }

  private handleLobbyIncrementalResult(
    result: TVoiceLobbyIncrementalResult,
  ): void {
    if (result === 'gap' || result === 'overflow') {
      void this.resyncLobbyState();
      return;
    }
    if (result === 'buffered' && !this.isLobbyResyncQueued) {
      void this.resyncLobbyState();
    }
  }

  /** Coalesces bursts: while one resync waits for the mutex, further requests are redundant. */
  private async resyncLobbyState(): Promise<void> {
    if (this.isLobbyResyncQueued) {
      return;
    }
    this.isLobbyResyncQueued = true;
    await this.loadLobbySnapshot();
  }

  @Mutexed(lobbyResyncMutex)
  private async loadLobbySnapshot(): Promise<void> {
    this.isLobbyResyncQueued = false;

    for (let attempt = 0; attempt < LOBBY_RESYNC_MAX_ATTEMPTS; attempt++) {
      if (!this.voiceRoomSocket.connected) {
        return;
      }

      let snapshot: IVoiceRoomGetAllPeersSnapshot;
      try {
        snapshot = await emitVoiceRoomWithAck(
          this.voiceRoomSocket,
          EVoiceRoomEvent.GET_ALL_PEERS,
        );
      } catch (error) {
        console.error('Failed to resync voice lobby state', error);
        if (attempt < LOBBY_RESYNC_MAX_ATTEMPTS - 1) {
          const backoff =
            LOBBY_SNAPSHOT_BACKOFF_MS[
              Math.min(attempt, LOBBY_SNAPSHOT_BACKOFF_MS.length - 1)
            ];
          await this.delayWithDisconnectAbort(backoff);
        }
        continue;
      }

      const isStillOutdated = this.voiceLobbyStore.setRoomsSnapshot(snapshot);
      if (!isStillOutdated) {
        return;
      }
    }
    console.warn('Voice lobby is still out of sync after resync attempts');
  }

  private delayWithDisconnectAbort(ms: number): Promise<void> {
    if (!this.voiceRoomSocket.connected) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const sub = fromEvent(this.voiceRoomEmitter, 'disconnect')
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
            timeoutId = undefined;
          }
          sub.unsubscribe();
          resolve();
        });

      timeoutId = setTimeout(() => {
        sub.unsubscribe();
        resolve();
      }, ms);
    });
  }
}
