import { EUserRole } from './enums';
import { ITextRoomMessage } from './schemas/text-room.schemas';
import { IUser } from './schemas/user.schemas';

export function canDeleteTextRoomMessage(
  message: Pick<ITextRoomMessage, 'senderId' | 'recipientId' | 'roomId'>,
  user: Pick<IUser, 'id' | 'role'> | null | undefined,
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
  return user.role === EUserRole.OWNER || user.role === EUserRole.ADMIN;
}
