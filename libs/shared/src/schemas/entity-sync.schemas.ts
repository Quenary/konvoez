import * as z from 'zod';
import { EEntitySyncEvent } from '../enums';
import { IRoom, IRoomDeleted } from './room.schemas';
import { IUser, IUserDeleted } from './user.schemas';
import {
  IVoiceRoomLobbyPeerJoined,
  IVoiceRoomLobbyPeerLeft,
  IVoiceRoomLobbyPeerMuted,
} from './voice-room.schemas';

export const userPresenceChangedSchema = z.object({
  userId: z.number().int(),
  isOnline: z.boolean(),
});
export type IUserPresenceChanged = z.infer<typeof userPresenceChangedSchema>;

export const userPresenceSnapshotSchema = z.object({
  userIds: z.array(z.number().int()),
});
export type IUserPresenceSnapshot = z.infer<typeof userPresenceSnapshotSchema>;

export type TEntitySyncEventPayloadMap = {
  [EEntitySyncEvent.USER_CREATED]: IUser;
  [EEntitySyncEvent.USER_UPDATED]: IUser;
  [EEntitySyncEvent.USER_DELETED]: IUserDeleted;
  [EEntitySyncEvent.ROOM_CREATED]: IRoom;
  [EEntitySyncEvent.ROOM_UPDATED]: IRoom;
  [EEntitySyncEvent.ROOM_DELETED]: IRoomDeleted;
  [EEntitySyncEvent.VOICE_ROOM_PEER_JOINED]: IVoiceRoomLobbyPeerJoined;
  [EEntitySyncEvent.VOICE_ROOM_PEER_LEFT]: IVoiceRoomLobbyPeerLeft;
  [EEntitySyncEvent.VOICE_ROOM_PEER_MUTED]: IVoiceRoomLobbyPeerMuted;
  [EEntitySyncEvent.USER_PRESENCE_CHANGED]: IUserPresenceChanged;
  [EEntitySyncEvent.USER_PRESENCE_SNAPSHOT]: IUserPresenceSnapshot;
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
