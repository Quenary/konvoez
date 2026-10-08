import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EUserRole, IUser } from '@konvoez/shared';
import { VoiceLobbyStore } from './voice-lobby.store';

const bob = {
  id: 42,
  username: 'bob',
  fullname: 'Bob',
  email: 'bob@example.com',
  avatarUrl: null,
  role: EUserRole.MEMBER,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUser;

const epoch = 'epoch-1';

describe('VoiceLobbyStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('updates lobby peers when a user entity changes', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({
      epoch,
      revision: 0,
      rooms: { 1: { [bob.id]: bob } },
    });

    store.applyUserEntityUpdate({ ...bob, fullname: 'Robert' });

    expect(store.roomsState()[1]?.[bob.id]?.fullname).toBe('Robert');
  });

  it('removes a deleted user from the lobby', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({
      epoch,
      revision: 0,
      rooms: { 1: { [bob.id]: bob } },
    });

    store.applyUserEntityDeleted(bob.id);

    expect(store.roomsState()[1]?.[bob.id]).toBeUndefined();
  });

  it('applies incremental lobby events after the snapshot revision', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 1, rooms: {} });

    expect(
      store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 2 }),
    ).toBe('applied');
    expect(store.roomsState()[1]?.[bob.id]).toEqual(bob);

    expect(
      store.applyVoicePeerLeft({
        roomId: 1,
        userId: bob.id,
        epoch,
        revision: 3,
      }),
    ).toBe('applied');
    expect(store.roomsState()[1]?.[bob.id]).toBeUndefined();
  });

  it('ignores events already covered by the snapshot', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 5, rooms: {} });

    expect(
      store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 5 }),
    ).toBe('stale');
    expect(store.roomsState()).toEqual({});
  });

  it('buffers a gap event and marks the lobby unsynced when a revision is missed', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 1, rooms: {} });

    expect(
      store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 3 }),
    ).toBe('gap');
    expect(store.roomsState()).toEqual({});
    expect(store.lobbyEpoch()).toBeNull();
    expect(store.lobbyRevision()).toBeNull();
    expect(store.pendingLobbyEvents()).toHaveLength(1);
  });

  it('buffers a gap event when the event belongs to another server epoch', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 50, rooms: {} });

    expect(
      store.applyVoicePeerJoined({
        roomId: 1,
        user: bob,
        epoch: 'epoch-2',
        revision: 1,
      }),
    ).toBe('gap');
    expect(store.lobbyEpoch()).toBeNull();
    expect(store.pendingLobbyEvents()).toHaveLength(1);
  });

  it('replays a gap-buffered event after a newer snapshot arrives', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 1, rooms: {} });

    expect(
      store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 3 }),
    ).toBe('gap');

    expect(store.setRoomsSnapshot({ epoch, revision: 2, rooms: {} })).toBe(
      false,
    );
    expect(store.roomsState()[1]?.[bob.id]).toEqual(bob);
    expect(store.lobbyRevision()).toBe(3);
  });

  it('buffers events until the snapshot and replays the newer ones in order', () => {
    const store = TestBed.inject(VoiceLobbyStore);

    expect(
      store.applyVoicePeerLeft({
        roomId: 1,
        userId: bob.id,
        epoch,
        revision: 4,
      }),
    ).toBe('buffered');
    expect(
      store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 3 }),
    ).toBe('buffered');
    expect(
      store.applyVoicePeerJoined({ roomId: 2, user: bob, epoch, revision: 2 }),
    ).toBe('buffered');
    expect(store.roomsState()).toEqual({});

    const needsResync = store.setRoomsSnapshot({
      epoch,
      revision: 2,
      rooms: { 2: { [bob.id]: bob } },
    });

    expect(needsResync).toBe(false);
    expect(store.roomsState()[2]?.[bob.id]).toEqual(bob);
    expect(store.roomsState()[1]?.[bob.id]).toBeUndefined();
    expect(store.pendingLobbyEvents()).toEqual([]);
  });

  it('asks for another snapshot when buffered events leave a gap', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 5 });

    const needsResync = store.setRoomsSnapshot({
      epoch,
      revision: 2,
      rooms: {},
    });

    expect(needsResync).toBe(true);
    expect(store.roomsState()).toEqual({});
  });

  it('drops buffered events from another epoch when a new snapshot is applied', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.applyVoicePeerJoined({
      roomId: 1,
      user: bob,
      epoch: 'epoch-2',
      revision: 1,
    });

    expect(store.setRoomsSnapshot({ epoch, revision: 7, rooms: {} })).toBe(
      false,
    );
    expect(store.roomsState()).toEqual({});
    expect(store.pendingLobbyEvents()).toEqual([]);
    expect(store.lobbyEpoch()).toBe(epoch);
    expect(store.lobbyRevision()).toBe(7);
  });

  it('drops poisoned epoch events after markUnsynced when the server restarts', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 1, rooms: {} });
    store.markUnsynced();

    expect(
      store.applyVoicePeerJoined({
        roomId: 1,
        user: bob,
        epoch: 'epoch-before-restart',
        revision: 2,
      }),
    ).toBe('buffered');

    expect(
      store.setRoomsSnapshot({
        epoch: 'epoch-after-restart',
        revision: 0,
        rooms: {},
      }),
    ).toBe(false);
    expect(store.lobbyEpoch()).toBe('epoch-after-restart');
    expect(store.lobbyRevision()).toBe(0);
    expect(store.pendingLobbyEvents()).toEqual([]);
    expect(store.roomsState()[1]?.[bob.id]).toBeUndefined();
  });

  it('ignores an older snapshot of the same epoch', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 5, rooms: { 1: {} } });

    expect(
      store.setRoomsSnapshot({
        epoch,
        revision: 3,
        rooms: { 1: { [bob.id]: bob } },
      }),
    ).toBe(false);
    expect(store.roomsState()).toEqual({ 1: {} });
    expect(store.lobbyRevision()).toBe(5);
  });

  it('accepts a snapshot of a new epoch even with a lower revision', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 50, rooms: {} });

    store.setRoomsSnapshot({
      epoch: 'epoch-2',
      revision: 0,
      rooms: { 1: { [bob.id]: bob } },
    });

    expect(store.lobbyEpoch()).toBe('epoch-2');
    expect(store.lobbyRevision()).toBe(0);
    expect(store.roomsState()[1]?.[bob.id]).toEqual(bob);
  });

  it('buffers events after markUnsynced until the next snapshot', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsSnapshot({ epoch, revision: 1, rooms: {} });

    store.markUnsynced();

    expect(
      store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 2 }),
    ).toBe('buffered');
    expect(store.roomsState()).toEqual({});
  });

  it('returns overflow and clears the buffer when pending events exceed the cap', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.markUnsynced();

    for (let revision = 1; revision <= 500; revision++) {
      expect(
        store.applyVoicePeerJoined({
          roomId: 1,
          user: bob,
          epoch,
          revision,
        }),
      ).toBe('buffered');
    }

    expect(
      store.applyVoicePeerJoined({
        roomId: 1,
        user: bob,
        epoch,
        revision: 501,
      }),
    ).toBe('overflow');
    expect(store.pendingLobbyEvents()).toEqual([]);
    expect(store.lobbyEpoch()).toBeNull();
  });

  it('reset clears rooms, sync marker and buffered events', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.applyVoicePeerJoined({ roomId: 1, user: bob, epoch, revision: 1 });
    store.setRoomsSnapshot({
      epoch,
      revision: 0,
      rooms: { 3: { [bob.id]: bob } },
    });

    store.reset();

    expect(store.roomsState()).toEqual({});
    expect(store.lobbyEpoch()).toBeNull();
    expect(store.lobbyRevision()).toBeNull();
    expect(store.pendingLobbyEvents()).toEqual([]);
  });
});
