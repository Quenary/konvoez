import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { createEffect } from '@ngrx/effects';
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
import { RoomsActions } from '@features/rooms/rooms.actions';
import { UsersStore } from '@features/users/users.store';
import { filter, finalize, fromEvent, map, tap, withLatestFrom } from 'rxjs';

@Injectable()
export class EntitySyncEffects {
  private readonly store = inject(Store);
  private readonly socket = inject(EntitySyncSocketToken);
  private readonly usersStore = inject(UsersStore);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly emitter = this.socket as never;

  constructor() {
    this.store
      .select(selectIsAuthorized)
      .pipe(
        takeUntilDestroyed(),
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

  readonly userCreated$ = createEffect(
    () =>
      fromEvent<IUser>(this.emitter, EEntitySyncEvent.USER_CREATED).pipe(
        tap((user) => {
          this.usersStore.upsertOne(user);
        }),
      ),
    { dispatch: false },
  );

  readonly userUpdated$ = createEffect(() =>
    fromEvent<IUser>(this.emitter, EEntitySyncEvent.USER_UPDATED).pipe(
      tap((user) => {
        this.usersStore.upsertOne(user);
        this.voiceSessionStore.applyUserEntityUpdate(user);
        this.voiceLobbyStore.applyUserEntityUpdate(user);
      }),
      withLatestFrom(this.store.select(selectCurrentUser)),
      filter(([user, currentUser]) => currentUser?.id === user.id),
      map(([user]) => AuthActions.requestPatchUserSuccess({ user })),
    ),
  );

  readonly userDeleted$ = createEffect(() =>
    fromEvent<IUserDeleted>(this.emitter, EEntitySyncEvent.USER_DELETED).pipe(
      tap(({ id }) => {
        this.usersStore.removeOne(id);
        this.voiceSessionStore.applyUserEntityDeleted(id);
        this.voiceLobbyStore.applyUserEntityDeleted(id);
      }),
      withLatestFrom(this.store.select(selectCurrentUser)),
      filter(([{ id }, currentUser]) => currentUser?.id === id),
      map(() => AuthActions.requestLogout()),
    ),
  );

  readonly roomCreated$ = createEffect(() =>
    fromEvent<IRoom>(this.emitter, EEntitySyncEvent.ROOM_CREATED).pipe(
      map((room) => RoomsActions.requestCreateRoomSuccess({ room })),
    ),
  );

  readonly roomUpdated$ = createEffect(() =>
    fromEvent<IRoom>(this.emitter, EEntitySyncEvent.ROOM_UPDATED).pipe(
      map((room) => RoomsActions.requestUpdateRoomSuccess({ room })),
    ),
  );

  readonly roomDeleted$ = createEffect(() =>
    fromEvent<IRoomDeleted>(this.emitter, EEntitySyncEvent.ROOM_DELETED).pipe(
      map(({ id }) => RoomsActions.requestDeleteRoomSuccess({ id })),
    ),
  );
}
