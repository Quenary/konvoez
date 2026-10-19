import type { EventEmitter2 } from '@nestjs/event-emitter';
import { emitAppEvent } from '@shared/events';

export const RolesDomainEvents = {
  ROLE_PERMISSIONS_CHANGED: 'role.permissions-changed',
} as const;

export type TRolesDomainEvent =
  (typeof RolesDomainEvents)[keyof typeof RolesDomainEvents];

export type TRolesDomainPayloadMap = {
  [RolesDomainEvents.ROLE_PERMISSIONS_CHANGED]: { userIds: number[] };
};

export function emitRolesDomainEvent<K extends TRolesDomainEvent>(
  eventEmitter: EventEmitter2,
  event: K,
  payload: TRolesDomainPayloadMap[K],
): void {
  emitAppEvent(eventEmitter, event, payload);
}
