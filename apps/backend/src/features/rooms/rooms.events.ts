import type { IRoom, IRoomDeleted } from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const RoomsDomainEvents = {
  ROOM_CREATED: 'room.created',
  ROOM_UPDATED: 'room.updated',
  ROOM_DELETED: 'room.deleted',
} as const;

export type TRoomsDomainEvent =
  (typeof RoomsDomainEvents)[keyof typeof RoomsDomainEvents];

export type TRoomsDomainPayloadMap = {
  [RoomsDomainEvents.ROOM_CREATED]: IRoom;
  [RoomsDomainEvents.ROOM_UPDATED]: IRoom;
  [RoomsDomainEvents.ROOM_DELETED]: IRoomDeleted;
};

export const emitRoomsDomainEvent =
  createDomainEventEmitter<TRoomsDomainPayloadMap>();
