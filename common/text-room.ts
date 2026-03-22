import { EUserRole } from './enums';

export namespace TextRoomCommon {
  export enum EEvent {
    JOIN = 'join',
    LEAVE = 'leave',
    MESSAGE_CREATED = 'message-created',
    MESSAGE_EDITED = 'message-edited',
    MESSAGE_DELETED = 'message-deleted',
    USER_TYPING = 'user-typing',
    ERROR = 'error',
  }
  export type TEventMap = {
    [EEvent.JOIN]: (data: IJoin) => any;
    [EEvent.LEAVE]: (data: any) => any;
    [EEvent.MESSAGE_CREATED]: (data: IMessage) => any;
    [EEvent.MESSAGE_EDITED]: (data: IMessage) => any;
    [EEvent.MESSAGE_DELETED]: (data: { id: string }) => any;
    [EEvent.USER_TYPING]: (data: IUserTyping) => any;
    [EEvent.ERROR]: (data: any) => any;
  };
  export interface ICreateMessage {
    recipientId: number | null;
    roomId: number | null;
    content: string;
  }
  export interface IEditMessage {
    content: string;
  }
  export interface IMessage {
    id: string;
    senderId: number;
    senderUsername: string;
    recipientId: number | null;
    roomId: number | null;
    createdAt: Date;
    updatedAt: Date | null;
    content: string;
  }
  export interface IJoin {
    roomId: number | null;
    recipientId: number | null;
  }
  export interface IUserTyping {
    id: number;
    username: string;
  }
  // TODO move to separate file
  export interface IPeer {
    /**
     * ID of the socket session
     */
    clientId: string;
    id: number;
    role: EUserRole;
    username: string;
    avatar: string | null;
  }
  export interface IListRequest {
    beforeId: string | null;
    afterId: string | null;
    limit: number;
    recipientId: number | null;
    roomId: number | null;
  }
  export interface IListResponse {
    items: IMessage[];
  }
}
