import type { IRoom, IRoomDeleted, IUser, IUserDeleted } from '@konvoez/shared';
import type { EventEmitter2 } from '@nestjs/event-emitter';

export const EntitySyncDomainEvents = {
  USER_CREATED: 'entity-sync.user.created',
  USER_UPDATED: 'entity-sync.user.updated',
  USER_DELETED: 'entity-sync.user.deleted',
  ROOM_CREATED: 'entity-sync.room.created',
  ROOM_UPDATED: 'entity-sync.room.updated',
  ROOM_DELETED: 'entity-sync.room.deleted',
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
};

export function emitEntitySyncDomainEvent<K extends TEntitySyncDomainEvent>(
  eventEmitter: EventEmitter2,
  event: K,
  payload: TEntitySyncDomainPayloadMap[K],
): void {
  eventEmitter.emit(event, payload);
}
