import { describe, expect, it } from 'vitest';
import { EPermission } from './enums';
import { canAccessRoomSnapshot } from './room-access';

describe('canAccessRoomSnapshot', () => {
  const baseUser = {
    id: 1,
    roleIds: [10],
  };

  const basePrivateRoom = {
    isPrivate: true,
    allowedUserIds: [2],
    allowedRoleIds: [20],
  };

  it('allows owner unconditionally even in private rooms without explicit access', () => {
    expect(
      canAccessRoomSnapshot({ ...baseUser, isOwner: true }, basePrivateRoom),
    ).toBe(true);
  });

  it('allows users with MANAGE_ROOMS permission unconditionally', () => {
    expect(
      canAccessRoomSnapshot(
        { ...baseUser, permissions: [EPermission.MANAGE_ROOMS] },
        basePrivateRoom,
      ),
    ).toBe(true);
  });

  it('allows access to non-private rooms', () => {
    expect(
      canAccessRoomSnapshot(baseUser, { ...basePrivateRoom, isPrivate: false }),
    ).toBe(true);

    expect(
      canAccessRoomSnapshot(baseUser, {
        ...basePrivateRoom,
        isPrivate: undefined,
      }),
    ).toBe(true);
  });

  it('allows access if user id is in allowedUserIds', () => {
    expect(canAccessRoomSnapshot({ ...baseUser, id: 2 }, basePrivateRoom)).toBe(
      true,
    );
  });

  it('allows access if user has any role in allowedRoleIds', () => {
    expect(
      canAccessRoomSnapshot(
        { ...baseUser, roleIds: [10, 20] },
        basePrivateRoom,
      ),
    ).toBe(true);
  });

  it('denies access if room is private and user is neither owner, manager, allowed user, nor in allowed roles', () => {
    expect(
      canAccessRoomSnapshot(
        {
          ...baseUser,
          permissions: [EPermission.SEND_MESSAGES],
          roleIds: [99],
        },
        basePrivateRoom,
      ),
    ).toBe(false);
  });

  it('denies access if room is private with empty allowed users and roles', () => {
    expect(
      canAccessRoomSnapshot(baseUser, {
        isPrivate: true,
        allowedUserIds: [],
        allowedRoleIds: [],
      }),
    ).toBe(false);
  });
});
