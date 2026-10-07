import { EventEmitter } from 'events';
import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EEntitySyncEvent,
  ERoomType,
  EUserRole,
  IRoom,
  IUser,
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
import { EntitySyncService } from './entity-sync.service';

describe('EntitySyncService', () => {
  let store: MockStore;
  let emitter: EventEmitter;
  let socket: EventEmitter & {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };
  let usersStore: {
    upsertOne: ReturnType<typeof vi.fn>;
    removeOne: ReturnType<typeof vi.fn>;
  };
  let roomsStore: {
    upsertOne: ReturnType<typeof vi.fn>;
    removeOne: ReturnType<typeof vi.fn>;
  };
  let voiceSessionStore: {
    applyUserEntityUpdate: ReturnType<typeof vi.fn>;
    applyUserEntityDeleted: ReturnType<typeof vi.fn>;
  };
  let voiceLobbyStore: {
    applyUserEntityUpdate: ReturnType<typeof vi.fn>;
    applyUserEntityDeleted: ReturnType<typeof vi.fn>;
  };

  const me: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const otherUser: IUser = {
    id: 2,
    username: 'bob',
    fullname: 'Bob',
    email: 'bob@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const room: IRoom = {
    id: 10,
    name: 'general',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    emitter = new EventEmitter();
    socket = Object.assign(emitter, {
      connect: vi.fn(),
      disconnect: vi.fn(),
    });

    usersStore = {
      upsertOne: vi.fn(),
      removeOne: vi.fn(),
    };

    roomsStore = {
      upsertOne: vi.fn(),
      removeOne: vi.fn(),
    };

    voiceSessionStore = {
      applyUserEntityUpdate: vi.fn(),
      applyUserEntityDeleted: vi.fn(),
    };

    voiceLobbyStore = {
      applyUserEntityUpdate: vi.fn(),
      applyUserEntityDeleted: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideMockStore({
          selectors: [
            { selector: selectIsAuthorized, value: false },
            { selector: selectCurrentUser, value: me },
          ],
        }),
        { provide: EntitySyncSocketToken, useValue: socket },
        { provide: UsersStore, useValue: usersStore },
        { provide: RoomsStore, useValue: roomsStore },
        { provide: VoiceSessionStore, useValue: voiceSessionStore },
        { provide: VoiceLobbyStore, useValue: voiceLobbyStore },
        EntitySyncService,
      ],
    });

    store = TestBed.inject(MockStore);
    vi.spyOn(store, 'dispatch');
  });

  afterEach(() => {
    store.resetSelectors();
  });

  const createService = (): EntitySyncService =>
    TestBed.inject(EntitySyncService);

  it('connects when authorized and disconnects when not', () => {
    createService();
    expect(socket.connect).not.toHaveBeenCalled();

    store.overrideSelector(selectIsAuthorized, true);
    store.refreshState();
    expect(socket.connect).toHaveBeenCalledTimes(1);

    store.overrideSelector(selectIsAuthorized, false);
    store.refreshState();
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('upserts user on USER_CREATED', () => {
    createService();
    emitter.emit(EEntitySyncEvent.USER_CREATED, otherUser);
    expect(usersStore.upsertOne).toHaveBeenCalledWith(otherUser);
  });

  it('updates stores and auth when the current user is updated', () => {
    createService();
    const updated = { ...me, fullname: 'Alice Updated' };
    emitter.emit(EEntitySyncEvent.USER_UPDATED, updated);

    expect(usersStore.upsertOne).toHaveBeenCalledWith(updated);
    expect(voiceSessionStore.applyUserEntityUpdate).toHaveBeenCalledWith(
      updated,
    );
    expect(voiceLobbyStore.applyUserEntityUpdate).toHaveBeenCalledWith(updated);
    expect(store.dispatch).toHaveBeenCalledWith(
      AuthActions.requestPatchUserSuccess({ user: updated }),
    );
  });

  it('does not patch auth when another user is updated', () => {
    createService();
    emitter.emit(EEntitySyncEvent.USER_UPDATED, otherUser);

    expect(usersStore.upsertOne).toHaveBeenCalledWith(otherUser);
    expect(store.dispatch).not.toHaveBeenCalledWith(
      AuthActions.requestPatchUserSuccess({ user: otherUser }),
    );
  });

  it('logs out when the current user is deleted', () => {
    createService();
    emitter.emit(EEntitySyncEvent.USER_DELETED, { id: me.id });

    expect(usersStore.removeOne).toHaveBeenCalledWith(me.id);
    expect(voiceSessionStore.applyUserEntityDeleted).toHaveBeenCalledWith(
      me.id,
    );
    expect(voiceLobbyStore.applyUserEntityDeleted).toHaveBeenCalledWith(me.id);
    expect(store.dispatch).toHaveBeenCalledWith(AuthActions.requestLogout());
  });

  it('does not log out when another user is deleted', () => {
    createService();
    emitter.emit(EEntitySyncEvent.USER_DELETED, { id: otherUser.id });

    expect(usersStore.removeOne).toHaveBeenCalledWith(otherUser.id);
    expect(store.dispatch).not.toHaveBeenCalledWith(
      AuthActions.requestLogout(),
    );
  });

  it('upserts room on ROOM_CREATED and ROOM_UPDATED', () => {
    createService();
    emitter.emit(EEntitySyncEvent.ROOM_CREATED, room);
    emitter.emit(EEntitySyncEvent.ROOM_UPDATED, { ...room, name: 'renamed' });

    expect(roomsStore.upsertOne).toHaveBeenCalledWith(room);
    expect(roomsStore.upsertOne).toHaveBeenCalledWith({
      ...room,
      name: 'renamed',
    });
  });

  it('removes room on ROOM_DELETED', () => {
    createService();
    emitter.emit(EEntitySyncEvent.ROOM_DELETED, { id: room.id });
    expect(roomsStore.removeOne).toHaveBeenCalledWith(room.id);
  });
});
