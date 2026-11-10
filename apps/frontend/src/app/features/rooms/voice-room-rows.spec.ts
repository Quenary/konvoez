import { describe, expect, it } from 'vitest';
import { ERoomType, IRoom, TVoiceRoomPeerUser } from '@konvoez/shared';
import {
  buildVoiceRoomRows,
  formatVoiceStackExtra,
  voiceRoomStack,
} from './voice-room-rows';

const room: IRoom = {
  id: 20,
  name: 'lounge',
  type: ERoomType.VOICE,
  avatar: null,
  avatarUrl: null,
  isPrivate: false,
  allowedRoleIds: [],
  allowedUserIds: [],
  author: { id: 1, username: 'alice', fullname: 'Alice' },
  createdAt: new Date(),
  updatedAt: null,
};

const peer = (id: number): TVoiceRoomPeerUser => ({
  id,
  username: `user${id}`,
  fullname: `User ${id}`,
  isOwner: false,
  roles: [],
  permissions: [],
  avatar: null,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: null,
});

describe('voice room rows', () => {
  it('marks the room when the current user is among its peers', () => {
    const rows = buildVoiceRoomRows(
      [room],
      { 20: { 1: peer(1), 2: peer(2) } },
      1,
    );
    expect(rows[0].isUserInRoom).toBe(true);
    expect(rows[0].peers.map((item) => item.id)).toEqual([1, 2]);
  });

  it.each([
    { count: 0, shown: 0, extra: 0 },
    { count: 1, shown: 1, extra: 0 },
    { count: 2, shown: 2, extra: 0 },
    { count: 5, shown: 2, extra: 3 },
    { count: 101, shown: 2, extra: 99 },
  ])(
    'stacks $shown avatars and $extra more for $count peers',
    ({ count, shown, extra }) => {
      const stack = voiceRoomStack(Array.from({ length: count }, (_, i) => i));
      expect(stack.shown).toHaveLength(shown);
      expect(stack.extra).toBe(extra);
    },
  );

  it.each([
    { extra: 1, label: '+1' },
    { extra: 3, label: '+3' },
    { extra: 99, label: '+99' },
    { extra: 100, label: '99+' },
  ])('formats $extra additional peers as $label', ({ extra, label }) => {
    expect(formatVoiceStackExtra(extra)).toBe(label);
  });
});
