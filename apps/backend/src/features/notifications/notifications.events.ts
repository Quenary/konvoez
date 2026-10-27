import type { TPushNotificationPayload } from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const NotificationsDomainEvents = {
  DELIVER: 'notifications.deliver',
} as const;

export type TNotificationsDomainEvent =
  (typeof NotificationsDomainEvents)[keyof typeof NotificationsDomainEvents];

export type INotificationDeliverPayload = {
  userId: number;
  payload: TPushNotificationPayload;
};

export type TNotificationsDomainPayloadMap = {
  [NotificationsDomainEvents.DELIVER]: INotificationDeliverPayload;
};

export const emitNotificationsDomainEvent =
  createDomainEventEmitter<TNotificationsDomainPayloadMap>();
