import * as z from 'zod';
import { pushNotificationBodyMaxLength } from '../const';
import { ENotificationsEvent } from '../enums';

export const vapidPublicKeySchema = z.object({
  publicKey: z.string().min(1),
});

export const pushSubscriptionEndpointSchema = z.object({
  endpoint: z.url(),
});

export const pushSubscriptionSchema = pushSubscriptionEndpointSchema.extend({
  keys: z.object({
    auth: z.string(),
    p256dh: z.string(),
  }),
  userAgent: z.string().optional(),
});

export const pushNotificationActionClickSchema = z.object({
  operation: z.enum([
    'openWindow',
    'focusLastFocusedOrOpen',
    'navigateLastFocusedOrOpen',
    'sendRequest',
  ]),
  url: z.string().optional(),
});

export const pushNotificationDataSchema = z.object({
  type: z.string().optional(),
  roomId: z.number().int().positive().optional(),
  recipientId: z.number().int().positive().optional(),
  senderId: z.number().int().positive().optional(),
  messageId: z.string().optional(),
  callId: z.string().optional(),
  callerId: z.number().int().positive().optional(),
  url: z.string().optional(),
  onActionClick: z
    .record(z.string(), pushNotificationActionClickSchema)
    .optional(),
});

export const pushNotificationPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(pushNotificationBodyMaxLength),
  icon: z.union([z.url(), z.literal('')]).optional(),
  tag: z.string().optional(),
  data: pushNotificationDataSchema.optional(),
});

export type TVapidPublicKey = z.infer<typeof vapidPublicKeySchema>;
export type TPushSubscription = z.infer<typeof pushSubscriptionSchema>;
export type TPushSubscriptionEndpoint = z.infer<
  typeof pushSubscriptionEndpointSchema
>;
export type TPushNotificationActionClick = z.infer<
  typeof pushNotificationActionClickSchema
>;
export type TPushNotificationData = z.infer<typeof pushNotificationDataSchema>;
export type TPushNotificationPayload = z.infer<
  typeof pushNotificationPayloadSchema
>;

export type TNotificationsEventPayloadMap = {
  [ENotificationsEvent.NOTIFICATION]: TPushNotificationPayload;
};

export type TNotificationsEventMap = {
  [K in keyof TNotificationsEventPayloadMap]: (
    payload: TNotificationsEventPayloadMap[K],
  ) => void;
};
