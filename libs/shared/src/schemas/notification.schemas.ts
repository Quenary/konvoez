import * as z from 'zod';
import { pushNotificationBodyMaxLength } from '../const';
import { ENotificationsEvent } from '../enums';

export const vapidPublicKeySchema = z.object({
  publicKey: z.string().min(1).nullable(),
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
  topic: z.string().max(32).optional(),
  data: pushNotificationDataSchema.optional(),
});

export const notificationDismissPayloadSchema = z.object({
  tag: z.string(),
  topic: z.string().max(32).optional(),
  messageId: z.string().optional(),
});

export const userNotificationMentionsSettingsSchema = z.object({
  username: z.boolean(),
  role: z.boolean(),
  everyone: z.boolean(),
});

export const userNotificationSettingsSchema = z.object({
  directMessages: z.boolean(),
  directCalls: z.boolean(),
  replies: z.boolean(),
  reactions: z.boolean(),
  mentions: userNotificationMentionsSettingsSchema,
});

export const updateUserNotificationMentionsSettingsSchema =
  userNotificationMentionsSettingsSchema.partial();

export const updateUserNotificationSettingsSchema = z.object({
  directMessages: z.boolean().optional(),
  directCalls: z.boolean().optional(),
  replies: z.boolean().optional(),
  reactions: z.boolean().optional(),
  mentions: updateUserNotificationMentionsSettingsSchema.optional(),
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
export type TNotificationsDismissPayload = z.infer<
  typeof notificationDismissPayloadSchema
>;

export type TUserNotificationMentionsSettings = z.infer<
  typeof userNotificationMentionsSettingsSchema
>;
export type TUserNotificationSettings = z.infer<
  typeof userNotificationSettingsSchema
>;
export type TUpdateUserNotificationMentionsSettings = z.infer<
  typeof updateUserNotificationMentionsSettingsSchema
>;
export type TUpdateUserNotificationSettings = z.infer<
  typeof updateUserNotificationSettingsSchema
>;

export const DEFAULT_USER_NOTIFICATION_SETTINGS: TUserNotificationSettings = {
  directMessages: true,
  directCalls: true,
  replies: true,
  reactions: true,
  mentions: {
    username: true,
    role: true,
    everyone: true,
  },
};

export type TMentionType = 'username' | 'role' | 'everyone';

export type TMentionRecipient = {
  userId: number;
  types: TMentionType[];
};

export type TNotificationsEventPayloadMap = {
  [ENotificationsEvent.NOTIFICATION]: TPushNotificationPayload;
  [ENotificationsEvent.NOTIFICATION_DISMISS]: TNotificationsDismissPayload;
};

export type TNotificationsEventMap = {
  [K in keyof TNotificationsEventPayloadMap]: (
    payload: TNotificationsEventPayloadMap[K],
  ) => void;
};
