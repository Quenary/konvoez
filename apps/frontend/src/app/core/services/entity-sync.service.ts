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
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { AuthActions } from '@features/auth/auth.actions';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@features/auth/auth.selectors';
import { RoomsStore } from '@features/rooms/rooms.store';
import { UsersStore } from '@features/users/users.store';
import { Mutexed } from '@shared/decorators/mutex.decorator';
import { Mutex } from 'async-mutex';
import { filter, finalize, fromEvent, merge, tap, withLatestFrom } from 'rxjs';

const lobbyResyncMutex = new Mutex();
const LOBBY_RESYNC_MAX_ATTEMPTS = 3;

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
          this.voiceSessionStore.applyUserEntityDeleted(id);
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
  }

  private bindVoiceLobbyEvents(): void {
    fromEvent<IVoiceRoomLobbyPeerJoined>(
      this.emitter,
      EEntitySyncEvent.VOICE_ROOM_PEER_JOINED,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        const result = this.voiceLobbyStore.applyVoicePeerJoined(payload);
        if (result === 'gap') {
          void this.resyncLobbyState();
        }
      });

    fromEvent<IVoiceRoomLobbyPeerLeft>(
      this.emitter,
      EEntitySyncEvent.VOICE_ROOM_PEER_LEFT,
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        const result = this.voiceLobbyStore.applyVoicePeerLeft(payload);
        if (result === 'gap') {
          void this.resyncLobbyState();
        }
      });
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
        snapshot = await this.voiceRoomSocket.emitWithAck(
          EVoiceRoomEvent.GET_ALL_PEERS,
        );
      } catch (error) {
        console.error('Failed to resync voice lobby state', error);
        return;
      }

      const isStillOutdated = this.voiceLobbyStore.setRoomsSnapshot(snapshot);
      if (!isStillOutdated) {
        return;
      }
    }
    console.warn('Voice lobby is still out of sync after resync attempts');
  }
}
