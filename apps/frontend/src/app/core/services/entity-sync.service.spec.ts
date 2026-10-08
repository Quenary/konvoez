import { EventEmitter } from 'events';
import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EEntitySyncEvent,
  EVoiceRoomEvent,
  ERoomType,
  EUserRole,
  IRoom,
  IUser,
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
    applyVoicePeerJoined: ReturnType<typeof vi.fn>;
    applyVoicePeerLeft: ReturnType<typeof vi.fn>;
    setRoomsSnapshot: ReturnType<typeof vi.fn>;
    markUnsynced: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };
  let voiceRoomEmitter: EventEmitter;
  let voiceRoomSocket: EventEmitter & {
    connected: boolean;
    emitWithAck: ReturnType<typeof vi.fn>;
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
      applyVoicePeerJoined: vi.fn().mockReturnValue('applied'),
      applyVoicePeerLeft: vi.fn().mockReturnValue('applied'),
      setRoomsSnapshot: vi.fn().mockReturnValue(false),
      markUnsynced: vi.fn(),
      reset: vi.fn(),
    };

    voiceRoomEmitter = new EventEmitter();
    voiceRoomSocket = Object.assign(voiceRoomEmitter, {
      connected: true,
      emitWithAck: vi.fn().mockResolvedValue({
        epoch: 'epoch-1',
        revision: 0,
        rooms: {},
      }),
    }) as EventEmitter & {
      connected: boolean;
      emitWithAck: ReturnType<typeof vi.fn>;
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
        { provide: VoiceRoomSocketToken, useValue: voiceRoomSocket },
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

  it('resets the voice lobby on logout', () => {
    store.overrideSelector(selectIsAuthorized, true);
    store.refreshState();
    createService();
    expect(voiceLobbyStore.reset).not.toHaveBeenCalled();

    store.overrideSelector(selectIsAuthorized, false);
    store.refreshState();

    expect(voiceLobbyStore.reset).toHaveBeenCalled();
  });

  describe('voice lobby', () => {
    const snapshot = { epoch: 'epoch-1', revision: 0, rooms: {} };

    const expectSnapshotRequested = async (): Promise<void> => {
      await vi.waitFor(() => {
        expect(voiceRoomSocket.emitWithAck).toHaveBeenCalledWith(
          EVoiceRoomEvent.GET_ALL_PEERS,
        );
        expect(voiceLobbyStore.setRoomsSnapshot).toHaveBeenCalledWith(snapshot);
      });
    };

    it('updates the lobby on VOICE_ROOM_PEER_JOINED', () => {
      createService();
      const payload = {
        roomId: 5,
        user: otherUser,
        epoch: 'epoch-1',
        revision: 1,
      };
      emitter.emit(EEntitySyncEvent.VOICE_ROOM_PEER_JOINED, payload);
      expect(voiceLobbyStore.applyVoicePeerJoined).toHaveBeenCalledWith(
        payload,
      );
    });

    it('updates the lobby on VOICE_ROOM_PEER_LEFT', () => {
      createService();
      const payload = {
        roomId: 5,
        userId: otherUser.id,
        epoch: 'epoch-1',
        revision: 2,
      };
      emitter.emit(EEntitySyncEvent.VOICE_ROOM_PEER_LEFT, payload);
      expect(voiceLobbyStore.applyVoicePeerLeft).toHaveBeenCalledWith(payload);
    });

    it('loads the snapshot when the voice socket is already connected', async () => {
      createService();
      await expectSnapshotRequested();
    });

    it('does not request a snapshot while the voice socket is down', async () => {
      voiceRoomSocket.connected = false;
      createService();

      emitter.emit('connect');
      await Promise.resolve();

      expect(voiceRoomSocket.emitWithAck).not.toHaveBeenCalled();
    });

    it('loads the snapshot when the voice socket connects', async () => {
      voiceRoomSocket.connected = false;
      createService();

      voiceRoomSocket.connected = true;
      voiceRoomEmitter.emit('connect');

      await expectSnapshotRequested();
    });

    it('loads the snapshot when the entity-sync socket reconnects', async () => {
      voiceRoomSocket.connected = false;
      createService();
      voiceRoomSocket.connected = true;

      emitter.emit('connect');

      await expectSnapshotRequested();
    });

    it.each(['sync', 'voice'] as const)(
      'marks the lobby unsynced when the %s socket disconnects',
      (source) => {
        voiceRoomSocket.connected = false;
        createService();

        (source === 'sync' ? emitter : voiceRoomEmitter).emit('disconnect');

        expect(voiceLobbyStore.markUnsynced).toHaveBeenCalledTimes(1);
      },
    );

    it('resyncs when a revision gap is detected', async () => {
      voiceRoomSocket.connected = false;
      voiceLobbyStore.applyVoicePeerJoined.mockReturnValue('gap');
      createService();
      voiceRoomSocket.connected = true;

      emitter.emit(EEntitySyncEvent.VOICE_ROOM_PEER_JOINED, {
        roomId: 5,
        user: otherUser,
        epoch: 'epoch-1',
        revision: 9,
      });

      await expectSnapshotRequested();
    });

    it('coalesces a burst of resync requests into one running and one queued request', async () => {
      voiceRoomSocket.connected = false;
      voiceLobbyStore.applyVoicePeerLeft.mockReturnValue('gap');
      createService();
      voiceRoomSocket.connected = true;

      const resolvers: Array<(value: typeof snapshot) => void> = [];
      voiceRoomSocket.emitWithAck.mockImplementation(
        () =>
          new Promise<typeof snapshot>((resolve) => {
            resolvers.push(resolve);
          }),
      );
      const emitGap = (revision: number) =>
        emitter.emit(EEntitySyncEvent.VOICE_ROOM_PEER_LEFT, {
          roomId: 5,
          userId: otherUser.id,
          epoch: 'epoch-1',
          revision,
        });

      emitGap(3);
      emitGap(4);
      await vi.waitFor(() => expect(resolvers).toHaveLength(1));

      emitGap(5);
      emitGap(6);
      expect(voiceRoomSocket.emitWithAck).toHaveBeenCalledTimes(1);

      resolvers[0](snapshot);
      await vi.waitFor(() => expect(resolvers).toHaveLength(2));
      resolvers[1](snapshot);
      await vi.waitFor(() =>
        expect(voiceLobbyStore.setRoomsSnapshot).toHaveBeenCalledTimes(2),
      );
      expect(voiceRoomSocket.emitWithAck).toHaveBeenCalledTimes(2);
    });

    it('stops re-requesting after a bounded number of outdated snapshots', async () => {
      voiceLobbyStore.setRoomsSnapshot.mockReturnValue(true);
      const warn = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      createService();

      await vi.waitFor(() => expect(warn).toHaveBeenCalled());
      expect(voiceRoomSocket.emitWithAck).toHaveBeenCalledTimes(3);
      warn.mockRestore();
    });

    it('keeps the lobby untouched when the snapshot request fails', async () => {
      voiceRoomSocket.emitWithAck.mockRejectedValue(new Error('timeout'));
      const error = vi
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      createService();

      await vi.waitFor(() => expect(error).toHaveBeenCalled());
      expect(voiceLobbyStore.setRoomsSnapshot).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });
});
