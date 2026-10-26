import { describe, expect, it } from 'vitest';
import { EVoiceSessionType, IUserSafe } from '@konvoez/shared';
import { resolveVoiceSessionPeers } from './voice-session-peers';

const me = {
  id: 1,
  username: 'me',
  fullname: 'Me',
  isOwner: false,
  roles: [],
  permissions: [],
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUserSafe;

const interlocutor = {
  id: 2,
  username: 'other',
  fullname: 'Other',
  isOwner: false,
  roles: [],
  permissions: [],
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUserSafe;

const groupPeer = {
  id: 3,
  username: 'groupie',
  fullname: 'Groupie',
  isOwner: false,
  roles: [],
  permissions: [],
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as IUserSafe;

describe('resolveVoiceSessionPeers', () => {
  it('uses real peers for group session', () => {
    const peers = resolveVoiceSessionPeers({
      me,
      remotePeers: [groupPeer],
      session: { type: EVoiceSessionType.GROUP_ROOM, roomId: 10 },
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
    });

    expect(peers.map((p) => p.id)).toEqual([me.id]);
  });

  it('returns only the local user when there is no media session', () => {
    const peers = resolveVoiceSessionPeers({
      me,
      remotePeers: [],
      session: null,
    });

    expect(peers.map((p) => p.id)).toEqual([me.id]);
  });
});
