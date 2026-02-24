import { EUserRole } from './enums';
import { Paged } from './paged';

export namespace TextRoomCommon {
  export enum EEvent {
    JOIN = 'join',
    LEAVE = 'leave',
    MESSAGE_CREATED = 'message-created',
    MESSAGE_EDITED = 'message-edited',
    MESSAGE_DELETED = 'message-deleted',
    USER_TYPING = 'user-typing',
  }

  export type TEventMap = {
    [EEvent.JOIN]: (data: IJoin) => any;
    [EEvent.LEAVE]: (data: any) => any;
    [EEvent.MESSAGE_CREATED]: (data: IMessage) => any;
    [EEvent.MESSAGE_EDITED]: (data: IMessage) => any;
    [EEvent.MESSAGE_DELETED]: (data: { id: string }) => any;
    [EEvent.USER_TYPING]: (data: IUserTyping) => any;
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
  export interface IPeer {
    /**
     * ID of the socket session
     */
    clientId: string;
    id: number;
    role: EUserRole;
    username: string;
  }
  export interface IListRequest extends Paged.IRequest {
    recipientId: number | null;
    roomId: number | null;
  }
}
