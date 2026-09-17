/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { baseEntitySchema, stringSchema } from './base.schemas';
import { messageListMaxLimit, messageListMinLimit } from '../const';
import { messageContentSchema } from './fields.schemas';
import { IUser } from './user.schemas';
import { ETextRoomEvent } from '../enums';

const nullableInt = z.number().int().nullable();
const nullableString = stringSchema.nullable();

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
  [K in ETextRoomEvent]: (
    data: TTextRoomEventPayloadMap[K],
    ...args: any[]
  ) => any;
};

export type TTextRoomEvent = {
  [K in ETextRoomEvent]: {
    event: K;
    data: TTextRoomEventPayloadMap[K];
  };
}[ETextRoomEvent];

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
  content: messageContentSchema,
  replyToId: z.uuid().nullish(),
});

export const messageEditSchema = z.object({
  content: messageContentSchema,
});

export const messageSchema = baseEntitySchema.extend({
  id: z.uuid(),
  senderId: z.number().int(),
  senderUsername: stringSchema,
  recipientId: nullableInt,
  roomId: nullableInt,
  content: messageContentSchema,
  replyTo: messageReplyToSchema.nullish(),
});

export const messageListRequestSchema = z.object({
  beforeId: nullableString,
  afterId: nullableString,
  aroundId: nullableString.nullish(),
  limit: z.number().int().min(messageListMinLimit).max(messageListMaxLimit),
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
