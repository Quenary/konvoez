import { createDomainEventEmitter } from '@shared/events';

export const RolesDomainEvents = {
  ROLE_PERMISSIONS_CHANGED: 'role.permissions-changed',
  ROLES_CHANGED: 'role.list-changed',
} as const;

export type TRolesDomainEvent =
  (typeof RolesDomainEvents)[keyof typeof RolesDomainEvents];

export type TRolesDomainPayloadMap = {
  [RolesDomainEvents.ROLE_PERMISSIONS_CHANGED]: { userIds: number[] };
  [RolesDomainEvents.ROLES_CHANGED]: Record<string, never>;
};

export const emitRolesDomainEvent =
  createDomainEventEmitter<TRolesDomainPayloadMap>();
