import { ITextRoomMessage } from '@konvoez/shared';

export type ChatTarget =
  { kind: 'room'; id: number } | { kind: 'direct'; id: number };

export function chatTargetsEqual(
  a: ChatTarget | null,
  b: ChatTarget | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a.kind === b.kind && a.id === b.id;
}

export function chatTargetToApiIds(target: ChatTarget | null): {
  roomId: number | null;
  recipientId: number | null;
} {
  if (!target) {
    return { roomId: null, recipientId: null };
  }
  if (target.kind === 'room') {
    return { roomId: target.id, recipientId: null };
  }
  return { roomId: null, recipientId: target.id };
}

export function messageBelongsToChat(
  message: Pick<ITextRoomMessage, 'roomId' | 'recipientId' | 'senderId'>,
  target: ChatTarget | null,
): boolean {
  if (!target) {
    return false;
  }
  if (target.kind === 'room') {
    return message.roomId === target.id;
  }
  return (
    message.roomId === null &&
    (message.senderId === target.id || message.recipientId === target.id)
  );
}
