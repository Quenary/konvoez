import { EEntitySyncEvent } from '../enums';
import { IRoom, IRoomDeleted } from './room.schemas';
import { IUser, IUserDeleted } from './user.schemas';

export type TEntitySyncEventPayloadMap = {
  [EEntitySyncEvent.USER_CREATED]: IUser;
  [EEntitySyncEvent.USER_UPDATED]: IUser;
  [EEntitySyncEvent.USER_DELETED]: IUserDeleted;
  [EEntitySyncEvent.ROOM_CREATED]: IRoom;
  [EEntitySyncEvent.ROOM_UPDATED]: IRoom;
  [EEntitySyncEvent.ROOM_DELETED]: IRoomDeleted;
  [EEntitySyncEvent.ERROR]: { message: string };
};

export type TEntitySyncEventMap = {
  [K in EEntitySyncEvent]: (
    data: TEntitySyncEventPayloadMap[K],
    ...args: unknown[]
  ) => void;
};

export type TEntitySyncEvent = {
  [K in EEntitySyncEvent]: {
    event: K;
    data: TEntitySyncEventPayloadMap[K];
  };
}[EEntitySyncEvent];
