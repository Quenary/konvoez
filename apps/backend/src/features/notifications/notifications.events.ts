import type { TPushNotificationPayload } from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const NotificationsDomainEvents = {
  DELIVER: 'notifications.deliver',
  DISMISS: 'notifications.dismiss',
} as const;

export type TNotificationsDomainEvent =
  (typeof NotificationsDomainEvents)[keyof typeof NotificationsDomainEvents];

export type INotificationDeliverPayload = {
  userId: number;
  payload: TPushNotificationPayload;
};

export type INotificationDismissPayload = {
  userId: number;
  tag: string;
  topic?: string;
  messageId?: string;
};

export type TNotificationsDomainPayloadMap = {
  [NotificationsDomainEvents.DELIVER]: INotificationDeliverPayload;
  [NotificationsDomainEvents.DISMISS]: INotificationDismissPayload;
};

export const emitNotificationsDomainEvent =
  createDomainEventEmitter<TNotificationsDomainPayloadMap>();
