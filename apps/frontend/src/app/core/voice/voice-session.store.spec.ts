import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { EUserRole, EVoiceSessionType, IUser } from '@konvoez/shared';
import { VoiceSessionStore } from './voice-session.store';

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

describe('VoiceSessionStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('computes selectedRoomId only for group sessions', () => {
    const store = TestBed.inject(VoiceSessionStore);
    store.setActiveSession({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: 9,
    });
    expect(store.selectedRoomId()).toBe(9);

    store.setActiveSession({
      type: EVoiceSessionType.DIRECT_CALL,
      callId: 'c1',
      interlocutorId: bob.id,
    });
    expect(store.selectedRoomId()).toBeNull();
    expect(store.directCallTarget()?.callId).toBe('c1');
  });

  it('updates and removes session peers on entity sync', () => {
    const store = TestBed.inject(VoiceSessionStore);
    store.setPeers([bob]);

    store.applyUserEntityUpdate({ ...bob, fullname: 'Robert' });
    expect(store.peersDict()[bob.id]?.fullname).toBe('Robert');

    store.applyUserEntityDeleted(bob.id);
    expect(store.peersDict()[bob.id]).toBeUndefined();
  });

  it('clears session peers without side effects', () => {
    const store = TestBed.inject(VoiceSessionStore);
    store.setPeers([bob]);
    store.clearSessionPeers();
    expect(store.peersList()).toEqual([]);
  });
});
