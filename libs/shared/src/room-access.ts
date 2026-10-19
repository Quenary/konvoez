import { EPermission } from './enums';

export function canAccessRoomSnapshot(
  user: {
    id: number;
    isOwner?: boolean;
    permissions?: readonly EPermission[];
    roleIds: readonly number[];
  },
  room: {
    isPrivate?: boolean;
    allowedUserIds: readonly number[];
    allowedRoleIds: readonly number[];
  },
): boolean {
  if (user.isOwner) {
    return true;
  }
  if (user.permissions?.includes(EPermission.MANAGE_ROOMS)) {
    return true;
  }
  if (!room.isPrivate) {
    return true;
  }
  if (room.allowedUserIds.includes(user.id)) {
    return true;
  }
  if (room.allowedRoleIds.length > 0 && user.roleIds.length > 0) {
    const allowedRoleSet = new Set(room.allowedRoleIds);
    if (user.roleIds.some((id) => allowedRoleSet.has(id))) {
      return true;
    }
  }
  return false;
}
