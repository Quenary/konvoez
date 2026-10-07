import { DestroyRef, inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Store } from '@ngrx/store';
import {
  EEntitySyncEvent,
  type IRoom,
  type IRoomDeleted,
  type IUser,
  type IUserDeleted,
} from '@konvoez/shared';
import { EntitySyncSocketToken } from '@core/tokens/entity-sync-socket.token';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { AuthActions } from '@features/auth/auth.actions';
import {
  selectCurrentUser,
  selectIsAuthorized,
} from '@features/auth/auth.selectors';
import { RoomsStore } from '@features/rooms/rooms.store';
import { UsersStore } from '@features/users/users.store';
import { filter, finalize, fromEvent, tap, withLatestFrom } from 'rxjs';

/**
 * Keeps the entity-sync socket connected for the app lifetime and mirrors
 * server entity changes into feature stores (and auth when the current user changes).
 */
@Injectable({ providedIn: 'root' })
export class EntitySyncService {
  private readonly store = inject(Store);
  private readonly destroyRef = inject(DestroyRef);
  private readonly socket = inject(EntitySyncSocketToken);
  private readonly usersStore = inject(UsersStore);
  private readonly roomsStore = inject(RoomsStore);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly emitter = this.socket as never;

  constructor() {
    this.bindAuthConnection();
    this.bindUserEvents();
    this.bindRoomEvents();
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
}
