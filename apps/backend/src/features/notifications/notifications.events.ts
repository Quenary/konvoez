import type {
  TNotificationUpdatePayload,
  TNotificationsDismissPayload,
  TPushNotificationPayload,
} from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const NotificationsDomainEvents = {
  DELIVER: 'notifications.deliver',
  DISMISS: 'notifications.dismiss',
  UPDATE: 'notifications.update',
} as const;

export type TNotificationsDomainEvent =
  (typeof NotificationsDomainEvents)[keyof typeof NotificationsDomainEvents];

export type INotificationDeliverPayload = {
  userId: number;
  payload: TPushNotificationPayload;
};

export type INotificationDismissPayload = TNotificationsDismissPayload & {
  userId: number;
};

export type INotificationUpdatePayload = {
  userId: number;
  payload: TNotificationUpdatePayload;
};

export type TNotificationsDomainPayloadMap = {
  [NotificationsDomainEvents.DELIVER]: INotificationDeliverPayload;
  [NotificationsDomainEvents.DISMISS]: INotificationDismissPayload;
  [NotificationsDomainEvents.UPDATE]: INotificationUpdatePayload;
};

export const emitNotificationsDomainEvent =
  createDomainEventEmitter<TNotificationsDomainPayloadMap>();
