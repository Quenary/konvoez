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

describe('VoiceLobbyStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('updates lobby peers when a user entity changes', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsState({ 1: { [bob.id]: bob } });

    store.applyUserEntityUpdate({ ...bob, fullname: 'Robert' });

    expect(store.roomsState()[1]?.[bob.id]?.fullname).toBe('Robert');
  });

  it('removes a deleted user from the lobby', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.setRoomsState({ 1: { [bob.id]: bob } });

    store.applyUserEntityDeleted(bob.id);

    expect(store.roomsState()[1]?.[bob.id]).toBeUndefined();
  });

  it('adds and removes peers in a room', () => {
    const store = TestBed.inject(VoiceLobbyStore);
    store.addPeerToRoom(1, bob);
    expect(store.roomsState()[1]?.[bob.id]).toEqual(bob);

    store.removePeerFromRoom(1, bob.id);
    expect(store.roomsState()[1]?.[bob.id]).toBeUndefined();
  });
});
