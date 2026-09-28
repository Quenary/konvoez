import { describe, expect, it } from 'vitest';
import { EUserRole, EVoiceSessionType, IUser } from '@konvoez/shared';
import {
  resolveVoiceSessionPeers,
  voicePeersGridClass,
} from './voice-session-peers';

const me = {
  id: 1,
  username: 'me',
  fullname: 'Me',
  email: 'me@example.com',
  role: EUserRole.MEMBER,
  createdAt: new Date(),
} as IUser;

const interlocutor = {
  id: 2,
  username: 'other',
  fullname: 'Other',
  email: 'other@example.com',
  role: EUserRole.MEMBER,
  createdAt: new Date(),
} as IUser;

const groupPeer = {
  id: 3,
  username: 'groupie',
  fullname: 'Groupie',
  email: 'g@example.com',
  role: EUserRole.MEMBER,
  createdAt: new Date(),
} as IUser;

describe('resolveVoiceSessionPeers', () => {
  it('uses real peers for group session even if interlocutor is set', () => {
    const peers = resolveVoiceSessionPeers({
      me,
      remotePeers: [groupPeer],
      session: { type: EVoiceSessionType.GROUP_ROOM, roomId: 10 },
      isRinging: false,
      interlocutor,
    });

    expect(peers.map((p) => p.id)).toEqual([me.id, groupPeer.id]);
  });

  it('does not synthesize missing interlocutor when alone in direct call', () => {
    const peers = resolveVoiceSessionPeers({
      me,
      remotePeers: [],
      session: {
        type: EVoiceSessionType.DIRECT_CALL,
        callId: 'c1',
        interlocutorId: interlocutor.id,
      },
      isRinging: false,
      interlocutor,
    });

    expect(peers.map((p) => p.id)).toEqual([me.id]);
  });

  it('shows interlocutor placeholder while ringing without media session', () => {
    const peers = resolveVoiceSessionPeers({
      me,
      remotePeers: [],
      session: null,
      isRinging: true,
      interlocutor,
    });

    expect(peers.map((p) => p.id)).toEqual([me.id, interlocutor.id]);
  });
});

describe('voicePeersGridClass', () => {
  it('maps peer counts to grid classes', () => {
    expect(voicePeersGridClass(1)).toBe('grid-1');
    expect(voicePeersGridClass(2)).toBe('grid-2');
    expect(voicePeersGridClass(4)).toBe('grid-4');
    expect(voicePeersGridClass(5)).toBe('grid-many');
  });
});
