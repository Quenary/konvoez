import type {
  IUser,
  IUserDeleted,
  IUserPresenceChanged,
} from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const UsersDomainEvents = {
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_PRESENCE_CHANGED: 'user.presence-changed',
  USER_PERMISSIONS_CHANGED: 'user.permissions-changed',
} as const;

export type TUsersDomainEvent =
  (typeof UsersDomainEvents)[keyof typeof UsersDomainEvents];

export type TUsersDomainPayloadMap = {
  [UsersDomainEvents.USER_CREATED]: IUser;
  [UsersDomainEvents.USER_UPDATED]: IUser;
  [UsersDomainEvents.USER_DELETED]: IUserDeleted;
  [UsersDomainEvents.USER_PRESENCE_CHANGED]: IUserPresenceChanged;
  [UsersDomainEvents.USER_PERMISSIONS_CHANGED]: { userIds: number[] };
};

export const emitUsersDomainEvent =
  createDomainEventEmitter<TUsersDomainPayloadMap>();
