import * as z from 'zod';
import { baseEntitySchema, SCHEMA_ERROR, stringSchema } from './base.schemas';
import {
  attachmentsMaxFilesHardLimit,
  messageListMaxLimit,
  messageListMinLimit,
} from '../const';
import { attachmentSchema } from './attachment.schemas';
import { messageOptionalContentSchema } from './fields.schemas';
import { userSchema } from './user.schemas';
import { ETextRoomEvent } from '../enums';
import { apiErrorResponseSchema, type TApiErrorResponse } from '../errors';
import { mentionSetSchema } from '../mentions';

const nullableInt = z.number().int().positive().nullish();
const nullableString = stringSchema.nullish();

export const textRoomJoinSchema = z.object({
  roomId: nullableInt,
  recipientId: nullableInt,
});
export type TTextRoomJoin = z.infer<typeof textRoomJoinSchema>;

export const textRoomUserTypingSchema = z.object({
  id: z.number().int(),
  username: stringSchema,
});
export type TTextRoomUserTyping = z.infer<typeof textRoomUserTypingSchema>;

export const textRoomPeerSchema = userSchema.extend({
  clientId: stringSchema,
});
export type TTextRoomPeer = z.infer<typeof textRoomPeerSchema>;

export const textRoomMessageDeletedSchema = z.object({
  id: z.uuid(),
});
export type TTextRoomMessageDeleted = z.infer<
  typeof textRoomMessageDeletedSchema
>;

export const textRoomErrorSchema = apiErrorResponseSchema;
export type TTextRoomError = TApiErrorResponse;

export const emojiRegex =
  /^(?:(?=.*\p{Extended_Pictographic})(?:[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]+)|\p{Regional_Indicator}{2})$/u;

export const messageReactionGroupSchema = z.object({
  emoji: stringSchema,
  count: z.number().int().positive(),
  userIds: z.array(z.number().int()),
});

export const messageReactionToggleSchema = z.object({
  emoji: stringSchema.min(1).max(32).regex(emojiRegex),
});

export const messageReplyToSchema = z.object({
  id: z.uuid(),
  senderId: z.number().int().nullish(),
  senderUsername: stringSchema.nullish(),
  content: stringSchema.nullish(),
  isDeleted: z.boolean().default(false),
});

export const messageCreateSchema = z.object({
  recipientId: nullableInt,
  roomId: nullableInt,
  content: messageOptionalContentSchema.default(''),
  replyToId: z.uuid().nullish(),
  attachmentIds: z
    .array(z.uuid())
    .max(attachmentsMaxFilesHardLimit)
    .default([]),
  clientId: z.uuid().optional(),
});

export const messageEditSchema = z.object({
  content: messageOptionalContentSchema,
});

export const messageSchema = baseEntitySchema.extend({
  id: z.uuid(),
  senderId: z.number().int(),
  senderUsername: stringSchema,
  recipientId: nullableInt,
  roomId: nullableInt,
  content: messageOptionalContentSchema,
  replyTo: messageReplyToSchema.nullish(),
  isRead: z.boolean(),
  attachments: z.array(attachmentSchema).default([]),
  clientId: z.uuid().nullable(),
  reactions: z.array(messageReactionGroupSchema).default([]),
  mentions: mentionSetSchema.default({
    userIds: [],
    roleIds: [],
    everyone: false,
  }),
});

export const markReadSchema = z.object({
  messageIds: z.array(z.uuid()).min(1),
});

export const unreadCountsSchema = z.object({
  rooms: z.record(z.string(), z.number().int().nonnegative()),
  roomMentions: z
    .record(z.string(), z.number().int().nonnegative())
    .default({}),
  direct: z.record(z.string(), z.number().int().nonnegative()),
  directTotal: z.number().int().nonnegative(),
});

export const messageListRequestSchema = z.object({
  beforeId: nullableString,
  afterId: nullableString,
  aroundId: nullableString.nullish(),
  limit: z.number().int().min(messageListMinLimit).max(messageListMaxLimit),
  recipientId: nullableInt,
  roomId: nullableInt,
  search: z.string().optional(),
  latest: z.boolean().optional(),
});

export const messageListResponseSchema = z.object({
  items: z.array(messageSchema),
  firstUnreadMessageId: z.uuid().nullable().default(null),
  hasMoreBefore: z.boolean().default(false),
  hasMoreAfter: z.boolean().default(false),
});

export const readAllSchema = z
  .object({
    roomId: nullableInt,
    recipientId: nullableInt,
  })
  .refine((v) => (v.roomId == null) !== (v.recipientId == null), {
    error: SCHEMA_ERROR.INVALID_CHAT_TARGET,
  });

export const messagesReadEventSchema = z.object({
  readerId: z.number().int(),
  roomId: nullableInt,
  recipientId: nullableInt,
  messageIds: z.array(z.uuid()).default([]),
  maxMessageId: z.uuid().nullable().default(null),
});

export const textRoomReactionUpdatedSchema = z.object({
  messageId: z.uuid(),
  roomId: nullableInt,
  recipientId: nullableInt,
  senderId: nullableInt,
  reactions: z.array(messageReactionGroupSchema),
});
export type TTextRoomReactionUpdated = z.infer<
  typeof textRoomReactionUpdatedSchema
>;

export type ITextRoomMessageReply = z.infer<typeof messageReplyToSchema>;
export type ITextRoomCreateMessage = z.infer<typeof messageCreateSchema>;
export type ITextRoomEditMessage = z.infer<typeof messageEditSchema>;
export type ITextRoomMessage = z.infer<typeof messageSchema>;
export type ITextRoomReactionGroup = z.infer<typeof messageReactionGroupSchema>;
export type ITextRoomReactionToggle = z.infer<
  typeof messageReactionToggleSchema
>;
export type ITextRoomListRequest = z.infer<typeof messageListRequestSchema>;
export type ITextRoomListResponse = z.infer<typeof messageListResponseSchema>;
export type ITextRoomMarkRead = z.infer<typeof markReadSchema>;
export type ITextRoomReadAll = z.infer<typeof readAllSchema>;
export type TTextRoomReadAll = ITextRoomReadAll;
export type TTextRoomMessagesRead = z.infer<typeof messagesReadEventSchema>;
export type ITextRoomMessagesRead = TTextRoomMessagesRead;
export type ITextRoomUnreadCounts = z.infer<typeof unreadCountsSchema>;

export type TTextRoomEventPayloadMap = {
  [ETextRoomEvent.JOIN]: TTextRoomJoin;
  [ETextRoomEvent.LEAVE]: object;
  [ETextRoomEvent.MESSAGE_CREATED]: ITextRoomMessage;
  [ETextRoomEvent.MESSAGE_EDITED]: ITextRoomMessage;
  [ETextRoomEvent.MESSAGE_DELETED]: TTextRoomMessageDeleted;
  [ETextRoomEvent.MESSAGE_REACTION_UPDATED]: TTextRoomReactionUpdated;
  [ETextRoomEvent.USER_TYPING]: TTextRoomUserTyping;
  [ETextRoomEvent.UNREAD_COUNTS_CHANGED]: ITextRoomUnreadCounts;
  [ETextRoomEvent.MESSAGES_READ]: TTextRoomMessagesRead;
  [ETextRoomEvent.ERROR]: TTextRoomError;
};

export type TTextRoomEventMap = {
  [K in ETextRoomEvent]: (
    data: TTextRoomEventPayloadMap[K],
    ...args: unknown[]
  ) => void;
};

export type TTextRoomEvent = {
  [K in ETextRoomEvent]: {
    event: K;
    data: TTextRoomEventPayloadMap[K];
  };
}[ETextRoomEvent];
