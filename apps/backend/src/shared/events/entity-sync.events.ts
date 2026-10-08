import type {
  IRoom,
  IRoomDeleted,
  IUser,
  IUserDeleted,
  IVoiceRoomLobbyPeerJoined,
  IVoiceRoomLobbyPeerLeft,
} from '@konvoez/shared';
import type { EventEmitter2 } from '@nestjs/event-emitter';

export const EntitySyncDomainEvents = {
  USER_CREATED: 'entity-sync.user.created',
  USER_UPDATED: 'entity-sync.user.updated',
  USER_DELETED: 'entity-sync.user.deleted',
  ROOM_CREATED: 'entity-sync.room.created',
  ROOM_UPDATED: 'entity-sync.room.updated',
  ROOM_DELETED: 'entity-sync.room.deleted',
  VOICE_ROOM_PEER_JOINED: 'entity-sync.voice-room.peer-joined',
  VOICE_ROOM_PEER_LEFT: 'entity-sync.voice-room.peer-left',
} as const;

export type TEntitySyncDomainEvent =
  (typeof EntitySyncDomainEvents)[keyof typeof EntitySyncDomainEvents];

export type TEntitySyncDomainPayloadMap = {
  [EntitySyncDomainEvents.USER_CREATED]: IUser;
  [EntitySyncDomainEvents.USER_UPDATED]: IUser;
  [EntitySyncDomainEvents.USER_DELETED]: IUserDeleted;
  [EntitySyncDomainEvents.ROOM_CREATED]: IRoom;
  [EntitySyncDomainEvents.ROOM_UPDATED]: IRoom;
  [EntitySyncDomainEvents.ROOM_DELETED]: IRoomDeleted;
  [EntitySyncDomainEvents.VOICE_ROOM_PEER_JOINED]: IVoiceRoomLobbyPeerJoined;
  [EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT]: IVoiceRoomLobbyPeerLeft;
};

export function emitEntitySyncDomainEvent<K extends TEntitySyncDomainEvent>(
  eventEmitter: EventEmitter2,
  event: K,
  payload: TEntitySyncDomainPayloadMap[K],
): void {
  eventEmitter.emit(event, payload);
}
