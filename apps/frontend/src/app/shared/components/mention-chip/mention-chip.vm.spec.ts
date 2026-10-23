import { describe, expect, it } from 'vitest';
import { IRoleSummary, IUser } from '@konvoez/shared';
import { tuiAutoColor } from '@taiga-ui/kit';
import { buildMentionChipVm, IMentionChipContext } from './mention-chip.vm';

describe('buildMentionChipVm', () => {
  const alice: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Wonderland',
    email: 'alice@example.com',
    avatar: 'avatar1.png',
    avatarUrl: 'https://example.com/avatar1.png',
    isOwner: false,
    roles: [
      {
        id: 10,
        name: 'Admin',
        color: '#ff0000',
        priority: 1,
        mentionable: true,
      },
    ],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const bob: IUser = {
    id: 2,
    username: 'bob',
    fullname: 'Bob Ross',
    email: 'bob@example.com',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const adminRole: IRoleSummary = {
    id: 10,
    name: 'Admin',
    color: '#ff0000',
    priority: 1,
    mentionable: true,
  };

  const modRole: IRoleSummary = {
    id: 20,
    name: 'Moderator',
    color: null,
    priority: 2,
    mentionable: true,
  };

  const baseCtx: IMentionChipContext = {
    usersById: { [alice.id]: alice, [bob.id]: bob },
    rolesById: { [adminRole.id]: adminRole, [modRole.id]: modRole },
    me: alice,
    unknownLabel: 'unknown',
    accepted: null,
  };

  it('builds VM for an existing user (other user)', () => {
    const vm = buildMentionChipVm({ kind: 'user', id: 2 }, baseCtx);

    expect(vm).toEqual({
      kind: 'user',
      id: 2,
      label: '@bob',
      isMe: false,
      appearance: 'neutral',
      avatar: {
        kind: 'user',
        username: 'bob',
        fullname: 'Bob Ross',
        avatarUrl: null,
      },
      textColo: tuiAutoColor('bob'),
    });
  });

  it('builds VM for an existing user (current user)', () => {
    const vm = buildMentionChipVm({ kind: 'user', id: 1 }, baseCtx);

    expect(vm).toEqual({
      kind: 'user',
      id: 1,
      label: '@alice',
      isMe: true,
      appearance: 'info',
      avatar: {
        kind: 'user',
        username: 'alice',
        fullname: 'Alice Wonderland',
        avatarUrl: 'https://example.com/avatar1.png',
      },
      textColo: undefined,
    });
  });

  it('builds VM for an unknown/missing user', () => {
    const vm = buildMentionChipVm({ kind: 'user', id: 999 }, baseCtx);

    expect(vm).toEqual({
      kind: 'unknown',
      id: 999,
      label: '@unknown',
      isMe: false,
      appearance: 'neutral',
      avatar: {
        kind: 'unknown',
      },
      textColo: undefined,
    });
  });

  it('builds VM for a role that the current user has', () => {
    const vm = buildMentionChipVm({ kind: 'role', id: 10 }, baseCtx);

    expect(vm).toEqual({
      kind: 'role',
      id: 10,
      label: '@Admin',
      isMe: true,
      appearance: 'info',
      avatar: {
        kind: 'role',
        name: 'Admin',
        color: '#ff0000',
      },
      textColo: undefined,
    });
  });

  it('builds VM for a role that the current user does not have', () => {
    const vm = buildMentionChipVm({ kind: 'role', id: 20 }, baseCtx);

    expect(vm).toEqual({
      kind: 'role',
      id: 20,
      label: '@Moderator',
      isMe: false,
      appearance: 'neutral',
      avatar: {
        kind: 'role',
        name: 'Moderator',
        color: null,
      },
      textColo: null,
    });
  });

  it('builds VM for an unknown/missing role', () => {
    const vm = buildMentionChipVm({ kind: 'role', id: 999 }, baseCtx);

    expect(vm).toEqual({
      kind: 'unknown',
      id: 999,
      label: '@unknown',
      isMe: false,
      appearance: 'neutral',
      avatar: {
        kind: 'unknown',
      },
      textColo: undefined,
    });
  });

  it('builds VM for everyone when user is logged in', () => {
    const vm = buildMentionChipVm({ kind: 'everyone' }, baseCtx);

    expect(vm).toEqual({
      kind: 'everyone',
      id: null,
      label: '@everyone',
      isMe: true,
      appearance: 'info',
      avatar: {
        kind: 'everyone',
      },
      textColo: undefined,
    });
  });

  it('builds VM for everyone when user is not logged in', () => {
    const vm = buildMentionChipVm(
      { kind: 'everyone' },
      { ...baseCtx, me: null },
    );

    expect(vm).toEqual({
      kind: 'everyone',
      id: null,
      label: '@everyone',
      isMe: false,
      appearance: 'neutral',
      avatar: {
        kind: 'everyone',
      },
      textColo: undefined,
    });
  });

  it('builds fallback unknown VM for unknown kind', () => {
    const vm = buildMentionChipVm({ kind: 'foobar', id: 123 }, baseCtx);

    expect(vm).toEqual({
      kind: 'unknown',
      id: 123,
      label: '@unknown',
      isMe: false,
      appearance: 'neutral',
      avatar: {
        kind: 'unknown',
      },
      textColo: undefined,
    });
  });

  describe('accepted mentions filtering', () => {
    it('sets isMe true and info for role when accepted.roleIds contains it', () => {
      const vm = buildMentionChipVm(
        { kind: 'role', id: 10 },
        {
          ...baseCtx,
          accepted: { userIds: [], roleIds: [10], everyone: false },
        },
      );
      expect(vm.isMe).toBe(true);
      expect(vm.appearance).toBe('info');
      expect(vm.textColo).toBeUndefined();
    });

    it('sets isMe false and neutral for role when accepted.roleIds does not contain it', () => {
      const vm = buildMentionChipVm(
        { kind: 'role', id: 10 },
        {
          ...baseCtx,
          accepted: { userIds: [], roleIds: [99], everyone: false },
        },
      );
      expect(vm.isMe).toBe(false);
      expect(vm.appearance).toBe('neutral');
      expect(vm.textColo).toBe('#ff0000');
    });

    it('sets isMe true and info for user when accepted.userIds contains me', () => {
      const vm = buildMentionChipVm(
        { kind: 'user', id: 1 },
        {
          ...baseCtx,
          accepted: { userIds: [1], roleIds: [], everyone: false },
        },
      );
      expect(vm.isMe).toBe(true);
      expect(vm.appearance).toBe('info');
      expect(vm.textColo).toBeUndefined();
    });

    it('sets isMe false and neutral for user when accepted.userIds does not contain me', () => {
      const vm = buildMentionChipVm(
        { kind: 'user', id: 1 },
        {
          ...baseCtx,
          accepted: { userIds: [2], roleIds: [], everyone: false },
        },
      );
      expect(vm.isMe).toBe(false);
      expect(vm.appearance).toBe('neutral');
      expect(vm.textColo).toBe(tuiAutoColor('alice'));
    });

    it('sets isMe true and info for everyone when accepted.everyone is true', () => {
      const vm = buildMentionChipVm(
        { kind: 'everyone' },
        {
          ...baseCtx,
          accepted: { userIds: [], roleIds: [], everyone: true },
        },
      );
      expect(vm.isMe).toBe(true);
      expect(vm.appearance).toBe('info');
    });

    it('sets isMe false and neutral for everyone when accepted.everyone is false', () => {
      const vm = buildMentionChipVm(
        { kind: 'everyone' },
        {
          ...baseCtx,
          accepted: { userIds: [], roleIds: [], everyone: false },
        },
      );
      expect(vm.isMe).toBe(false);
      expect(vm.appearance).toBe('neutral');
    });

    it('keeps token-based result when accepted is null', () => {
      const userVm = buildMentionChipVm(
        { kind: 'user', id: 1 },
        { ...baseCtx, accepted: null },
      );
      expect(userVm.isMe).toBe(true);
      expect(userVm.appearance).toBe('info');

      const roleVm = buildMentionChipVm(
        { kind: 'role', id: 10 },
        { ...baseCtx, accepted: null },
      );
      expect(roleVm.isMe).toBe(true);
      expect(roleVm.appearance).toBe('info');

      const everyoneVm = buildMentionChipVm(
        { kind: 'everyone' },
        { ...baseCtx, accepted: null },
      );
      expect(everyoneVm.isMe).toBe(true);
      expect(everyoneVm.appearance).toBe('info');
      expect(userVm.textColo).toBeUndefined();
      expect(roleVm.textColo).toBeUndefined();
      expect(everyoneVm.textColo).toBeUndefined();
    });
  });
});
