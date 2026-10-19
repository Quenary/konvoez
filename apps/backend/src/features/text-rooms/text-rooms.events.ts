import type {
  ITextRoomMessage,
  TTextRoomReactionUpdated,
} from '@konvoez/shared';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAppEvent } from '@shared/events';

export const TextRoomsDomainEvents = {
  MESSAGE_CREATED: 'text-room.message.created',
  MESSAGE_UPDATED: 'text-room.message.updated',
  MESSAGE_DELETED: 'text-room.message.deleted',
  MESSAGE_REACTION_UPDATED: 'text-room.message.reaction.updated',
} as const;

export type TTextRoomsDomainEvent =
  (typeof TextRoomsDomainEvents)[keyof typeof TextRoomsDomainEvents];

export type TTextRoomsDomainPayloadMap = {
  [TextRoomsDomainEvents.MESSAGE_CREATED]: ITextRoomMessage;
  [TextRoomsDomainEvents.MESSAGE_UPDATED]: ITextRoomMessage;
  [TextRoomsDomainEvents.MESSAGE_DELETED]: { id: string };
  [TextRoomsDomainEvents.MESSAGE_REACTION_UPDATED]: TTextRoomReactionUpdated;
};

export function emitTextRoomsDomainEvent<K extends TTextRoomsDomainEvent>(
  eventEmitter: EventEmitter2,
  event: K,
  payload: TTextRoomsDomainPayloadMap[K],
): void {
  emitAppEvent(eventEmitter, event, payload);
}
