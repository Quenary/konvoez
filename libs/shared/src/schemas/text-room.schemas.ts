import * as z from 'zod';
import { baseEntitySchema, stringSchema } from './base.schemas';
import {
  attachmentsMaxFilesHardLimit,
  messageListMaxLimit,
  messageListMinLimit,
} from '../const';
import { attachmentSchema } from './attachment.schemas';
import { messageOptionalContentSchema } from './fields.schemas';
import { IUser } from './user.schemas';
import { ETextRoomEvent } from '../enums';

const nullableInt = z.number().int().nullable();
const nullableString = stringSchema.nullable();

export interface ITextRoomReactionUpdated {
  messageId: string;
  roomId: number | null;
  recipientId: number | null;
  senderId: number | null;
  reactions: ITextRoomReactionGroup[];
}

export type TTextRoomEventPayloadMap = {
  [ETextRoomEvent.JOIN]: ITextRoomJoin;
  [ETextRoomEvent.LEAVE]: object;
  [ETextRoomEvent.MESSAGE_CREATED]: ITextRoomMessage;
  [ETextRoomEvent.MESSAGE_EDITED]: ITextRoomMessage;
  [ETextRoomEvent.MESSAGE_DELETED]: { id: string };
  [ETextRoomEvent.MESSAGE_REACTION_UPDATED]: ITextRoomReactionUpdated;
  [ETextRoomEvent.USER_TYPING]: ITextRoomUserTyping;
  [ETextRoomEvent.ERROR]: { message: string };
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
});

export const markReadSchema = z.object({
  messageIds: z.array(z.uuid()).min(1),
});

export const unreadCountsSchema = z.object({
  rooms: z.record(z.string(), z.number().int().nonnegative()),
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
});

export const messageListResponseSchema = z.object({
  items: z.array(messageSchema),
});

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
export type ITextRoomUnreadCounts = z.infer<typeof unreadCountsSchema>;

export interface ITextRoomJoin {
  roomId: number | null;
  recipientId: number | null;
}

export interface ITextRoomUserTyping {
  id: number;
  username: string;
}

export interface ITextRoomPeer extends IUser {
  /**
   * ID of the socket session
   */
  clientId: string;
}
