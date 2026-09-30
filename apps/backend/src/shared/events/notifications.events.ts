import type { EventEmitter2 } from '@nestjs/event-emitter';

export const NotificationsDomainEvents = {
  DIRECT_MESSAGE: 'notifications.direct-message',
  DIRECT_CALL: 'notifications.direct-call',
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

export type IDirectCallNotificationPayload = {
  recipientId: number;
  callerId: number;
  callerUsername: string;
  callId: string;
};

export type TNotificationsDomainPayloadMap = {
  [NotificationsDomainEvents.DIRECT_MESSAGE]: IDirectMessageNotificationPayload;
  [NotificationsDomainEvents.DIRECT_CALL]: IDirectCallNotificationPayload;
};

export function emitNotificationsDomainEvent<
  K extends TNotificationsDomainEvent,
>(
  eventEmitter: EventEmitter2,
  event: K,
  payload: TNotificationsDomainPayloadMap[K],
): void {
  eventEmitter.emit(event, payload);
}
