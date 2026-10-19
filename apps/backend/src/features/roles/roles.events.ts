import { createDomainEventEmitter } from '@shared/events';

export const RolesDomainEvents = {
  ROLE_PERMISSIONS_CHANGED: 'role.permissions-changed',
} as const;

export type TRolesDomainEvent =
  (typeof RolesDomainEvents)[keyof typeof RolesDomainEvents];

export type TRolesDomainPayloadMap = {
  [RolesDomainEvents.ROLE_PERMISSIONS_CHANGED]: { userIds: number[] };
};

export const emitRolesDomainEvent =
  createDomainEventEmitter<TRolesDomainPayloadMap>();
