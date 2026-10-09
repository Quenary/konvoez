import type {
  ITextRoomMessage,
  ITextRoomReactionUpdated,
} from '@konvoez/shared';
import type { EventEmitter2 } from '@nestjs/event-emitter';

export const TextRoomDomainEvents = {
  MESSAGE_CREATED: 'text-room.message.created',
  MESSAGE_UPDATED: 'text-room.message.updated',
  MESSAGE_DELETED: 'text-room.message.deleted',
  MESSAGE_REACTION_UPDATED: 'text-room.message.reaction.updated',
} as const;

export type TTextRoomDomainEvent =
  (typeof TextRoomDomainEvents)[keyof typeof TextRoomDomainEvents];

export type TTextRoomDomainPayloadMap = {
  [TextRoomDomainEvents.MESSAGE_CREATED]: ITextRoomMessage;
  [TextRoomDomainEvents.MESSAGE_UPDATED]: ITextRoomMessage;
  [TextRoomDomainEvents.MESSAGE_DELETED]: { id: string };
  [TextRoomDomainEvents.MESSAGE_REACTION_UPDATED]: ITextRoomReactionUpdated;
};

export function emitTextRoomDomainEvent<K extends TTextRoomDomainEvent>(
  eventEmitter: EventEmitter2,
  event: K,
  payload: TTextRoomDomainPayloadMap[K],
): void {
  eventEmitter.emit(event, payload);
}
