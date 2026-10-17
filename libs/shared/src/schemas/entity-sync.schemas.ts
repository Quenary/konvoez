import * as z from 'zod';
import { EEntitySyncEvent } from '../enums';
import { IRoom, IRoomDeleted } from './room.schemas';
import { IUser, IUserDeleted } from './user.schemas';
import {
  TVoiceRoomLobbyPeerJoined,
  TVoiceRoomLobbyPeerLeft,
  TVoiceRoomLobbyPeerMuted,
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

export const entitySyncErrorSchema = z.object({
  message: z.string(),
});
export type TEntitySyncError = z.infer<typeof entitySyncErrorSchema>;

export type TEntitySyncEventPayloadMap = {
  [EEntitySyncEvent.USER_CREATED]: IUser;
  [EEntitySyncEvent.USER_UPDATED]: IUser;
  [EEntitySyncEvent.USER_DELETED]: IUserDeleted;
  [EEntitySyncEvent.ROOM_CREATED]: IRoom;
  [EEntitySyncEvent.ROOM_UPDATED]: IRoom;
  [EEntitySyncEvent.ROOM_DELETED]: IRoomDeleted;
  [EEntitySyncEvent.VOICE_ROOM_PEER_JOINED]: TVoiceRoomLobbyPeerJoined;
  [EEntitySyncEvent.VOICE_ROOM_PEER_LEFT]: TVoiceRoomLobbyPeerLeft;
  [EEntitySyncEvent.VOICE_ROOM_PEER_MUTED]: TVoiceRoomLobbyPeerMuted;
  [EEntitySyncEvent.USER_PRESENCE_CHANGED]: IUserPresenceChanged;
  [EEntitySyncEvent.USER_PRESENCE_SNAPSHOT]: IUserPresenceSnapshot;
  [EEntitySyncEvent.ERROR]: TEntitySyncError;
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
