/* eslint-disable @typescript-eslint/no-explicit-any */
import { IUser } from './user';

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

export interface ITextRoomCreateMessage {
  recipientId: number | null;
  roomId: number | null;
  content: string;
}

export interface ITextRoomEditMessage {
  content: string;
}

export interface ITextRoomMessage {
  id: string;
  senderId: number;
  senderUsername: string;
  recipientId: number | null;
  roomId: number | null;
  createdAt: Date;
  updatedAt: Date | null | undefined;
  content: string;
}

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

export interface ITextRoomListRequest {
  beforeId: string | null;
  afterId: string | null;
  limit: number;
  recipientId: number | null;
  roomId: number | null;
}

export interface ITextRoomListResponse {
  items: ITextRoomMessage[];
}
