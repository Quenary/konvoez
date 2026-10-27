import type {
  ITextRoomMessage,
  ITextRoomUnreadCounts,
  TMentionRecipient,
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
  DIRECT_MESSAGE_CREATED: 'text-room.direct-message.created',
  MENTION_CREATED: 'text-room.mention.created',
  REPLY_CREATED: 'text-room.reply.created',
  REACTION_ADDED: 'text-room.reaction.added',
} as const;

export type TTextRoomsDomainEvent =
  (typeof TextRoomsDomainEvents)[keyof typeof TextRoomsDomainEvents];

export type TTextRoomDirectMessageCreatedPayload = {
  recipientId: number;
  senderId: number;
  senderUsername: string;
  messagePreview: string;
  messageId: string;
};

export type TTextRoomMentionCreatedPayload = {
  recipients: TMentionRecipient[];
  senderId: number;
  senderUsername: string;
  roomId: number;
  roomName: string;
  messageId: string;
  messagePreview: string;
};

export type TTextRoomReplyCreatedPayload = {
  recipientId: number;
  senderId: number;
  senderUsername: string;
  roomId: number;
  roomName: string;
  messageId: string;
  messagePreview: string;
};

export type TTextRoomReactionAddedPayload = {
  recipientId: number;
  senderId: number;
  senderUsername: string;
  emoji: string;
  roomId?: number | null;
  roomName?: string | null;
  messageId: string;
  messagePreview: string;
};

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
  [TextRoomsDomainEvents.DIRECT_MESSAGE_CREATED]: TTextRoomDirectMessageCreatedPayload;
  [TextRoomsDomainEvents.MENTION_CREATED]: TTextRoomMentionCreatedPayload;
  [TextRoomsDomainEvents.REPLY_CREATED]: TTextRoomReplyCreatedPayload;
  [TextRoomsDomainEvents.REACTION_ADDED]: TTextRoomReactionAddedPayload;
};

export const emitTextRoomsDomainEvent =
  createDomainEventEmitter<TTextRoomsDomainPayloadMap>();
