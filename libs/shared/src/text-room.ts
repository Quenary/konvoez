import { EPermission, EUserRole } from './enums';
import { ITextRoomMessage } from './schemas/text-room.schemas';
import { IUserSafe } from './schemas/user.schemas';

export function canDeleteTextRoomMessage(
  message: Pick<ITextRoomMessage, 'senderId' | 'recipientId' | 'roomId'>,
  user:
    | (Pick<IUserSafe, 'id'> &
        Partial<Pick<IUserSafe, 'role' | 'isOwner' | 'permissions'>>)
    | null
    | undefined,
): boolean {
  if (!user) {
    return false;
  }
  if (message.senderId === user.id) {
    return true;
  }
  if (message.recipientId != null || message.roomId == null) {
    return false;
  }
  if (user.isOwner === true) {
    return true;
  }
  if (user.permissions?.includes(EPermission.MODERATE_MESSAGES)) {
    return true;
  }
  return user.role === EUserRole.OWNER || user.role === EUserRole.ADMIN;
}
