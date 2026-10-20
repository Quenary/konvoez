import type {
  ITextRoomMessage,
  ITextRoomUnreadCounts,
  TTextRoomMessagesRead,
  TTextRoomReactionUpdated,
} from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const TextRoomsDomainEvents = {
  MESSAGE_CREATED: 'text-room.message.created',
  MESSAGE_UPDATED: 'text-room.message.updated',
  MESSAGE_DELETED: 'text-room.message.deleted',
  MESSAGE_REACTION_UPDATED: 'text-room.message.reaction.updated',
  MESSAGES_READ: 'text-room.messages.read',
  UNREAD_COUNTS_CHANGED: 'text-room.unread-counts.changed',
} as const;

export type TTextRoomsDomainEvent =
  (typeof TextRoomsDomainEvents)[keyof typeof TextRoomsDomainEvents];

export type TTextRoomsDomainPayloadMap = {
  [TextRoomsDomainEvents.MESSAGE_CREATED]: ITextRoomMessage;
  [TextRoomsDomainEvents.MESSAGE_UPDATED]: ITextRoomMessage;
  [TextRoomsDomainEvents.MESSAGE_DELETED]: { id: string };
  [TextRoomsDomainEvents.MESSAGE_REACTION_UPDATED]: TTextRoomReactionUpdated;
  [TextRoomsDomainEvents.MESSAGES_READ]: TTextRoomMessagesRead;
  [TextRoomsDomainEvents.UNREAD_COUNTS_CHANGED]: {
    userId: number;
    counts: ITextRoomUnreadCounts;
  };
};

export const emitTextRoomsDomainEvent =
  createDomainEventEmitter<TTextRoomsDomainPayloadMap>();
