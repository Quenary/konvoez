import type {
  TMentionRecipient,
  TPushNotificationPayload,
} from '@konvoez/shared';
import { createDomainEventEmitter } from '@shared/events';

export const NotificationsDomainEvents = {
  DIRECT_MESSAGE: 'notifications.direct-message',
  DIRECT_CALL: 'notifications.direct-call',
  DELIVER: 'notifications.deliver',
  MENTION: 'notifications.mention',
} as const;

export type TNotificationsDomainEvent =
  (typeof NotificationsDomainEvents)[keyof typeof NotificationsDomainEvents];

export type IDirectMessageNotificationPayload = {
  recipientId: number;
  senderId: number;
  senderUsername: string;
  messagePreview: string;
  messageId: string;
};

export type IMentionNotificationPayload = {
  recipients: TMentionRecipient[];
  senderId: number;
  senderUsername: string;
  roomId: number;
  roomName: string;
  messageId: string;
  messagePreview: string;
};

export type IDirectCallNotificationPayload = {
  recipientId: number;
  callerId: number;
  callerUsername: string;
  callId: string;
};

export type INotificationDeliverPayload = {
  userId: number;
  payload: TPushNotificationPayload;
};

export type TNotificationsDomainPayloadMap = {
  [NotificationsDomainEvents.DIRECT_MESSAGE]: IDirectMessageNotificationPayload;
  [NotificationsDomainEvents.DIRECT_CALL]: IDirectCallNotificationPayload;
  [NotificationsDomainEvents.DELIVER]: INotificationDeliverPayload;
  [NotificationsDomainEvents.MENTION]: IMentionNotificationPayload;
};

export const emitNotificationsDomainEvent =
  createDomainEventEmitter<TNotificationsDomainPayloadMap>();
