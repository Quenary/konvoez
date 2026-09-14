/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import {
  messageListMaxLimit,
  messageListMinLimit,
} from './const';
import { messageContentSchema } from './schemas/fields';
import { IUser } from './user';

const nullableInt = z.number().int().nullable();
const nullableString = z.string().nullable();

export enum ETextRoomEvent {
  JOIN = 'join',
  LEAVE = 'leave',
  MESSAGE_CREATED = 'message-created',
  MESSAGE_EDITED = 'message-edited',
  MESSAGE_DELETED = 'message-deleted',
  USER_TYPING = 'user-typing',
  ERROR = 'error',
}

export type TTextRoomEventPayloadMap = {
  [ETextRoomEvent.JOIN]: ITextRoomJoin;
  [ETextRoomEvent.LEAVE]: object;
  [ETextRoomEvent.MESSAGE_CREATED]: ITextRoomMessage;
  [ETextRoomEvent.MESSAGE_EDITED]: ITextRoomMessage;
  [ETextRoomEvent.MESSAGE_DELETED]: { id: string };
  [ETextRoomEvent.USER_TYPING]: ITextRoomUserTyping;
  [ETextRoomEvent.ERROR]: { message: string };
};

export type TTextRoomEventMap = {
  [K in ETextRoomEvent]: (data: TTextRoomEventPayloadMap[K], ...args: any[]) => any;
};

export type TTextRoomEvent = {
  [K in ETextRoomEvent]: {
    event: K;
    data: TTextRoomEventPayloadMap[K];
  };
}[ETextRoomEvent];

export const messageReplyToSchema = z.object({
  id: z.uuid(),
  senderId: z.number().int().nullable().optional(),
  senderUsername: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  isDeleted: z.boolean().default(false),
});

export const messageCreateSchema = z.object({
  recipientId: nullableInt,
  roomId: nullableInt,
  content: messageContentSchema,
  replyToId: z.uuid().nullable().optional(),
});

export const messageEditSchema = z.object({
  content: messageContentSchema,
});

export const messageSchema = z.object({
  id: z.uuid(),
  senderId: z.number().int(),
  senderUsername: z.string(),
  recipientId: nullableInt,
  roomId: nullableInt,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullish(),
  content: messageContentSchema,
  replyTo: messageReplyToSchema.nullable().optional(),
});

export const messageListRequestSchema = z.object({
  beforeId: nullableString,
  afterId: nullableString,
  aroundId: nullableString.nullish(),
  limit: z
    .number()
    .int()
    .min(messageListMinLimit)
    .max(messageListMaxLimit),
  recipientId: nullableInt,
  roomId: nullableInt,
});

export const messageListResponseSchema = z.object({
  items: z.array(messageSchema),
});

export type ITextRoomMessageReply = z.infer<typeof messageReplyToSchema>;
export type ITextRoomCreateMessage = z.infer<typeof messageCreateSchema>;
export type ITextRoomEditMessage = z.infer<typeof messageEditSchema>;
export type ITextRoomMessage = z.infer<typeof messageSchema>;
export type ITextRoomListRequest = z.infer<typeof messageListRequestSchema>;
export type ITextRoomListResponse = z.infer<typeof messageListResponseSchema>;

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


