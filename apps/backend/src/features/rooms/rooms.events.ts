import type { IRoom, IRoomDeleted } from '@konvoez/shared';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAppEvent } from '@shared/events';

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

export function emitRoomsDomainEvent<K extends TRoomsDomainEvent>(
  eventEmitter: EventEmitter2,
  event: K,
  payload: TRoomsDomainPayloadMap[K],
): void {
  emitAppEvent(eventEmitter, event, payload);
}
