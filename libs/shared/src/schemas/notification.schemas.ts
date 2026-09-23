import { z } from 'zod';
import { pushNotificationBodyMaxLength } from '../const';

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

export const pushNotificationPayloadSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(pushNotificationBodyMaxLength),
  icon: z.union([z.url(), z.literal('')]).optional(),
  tag: z.string().optional(),
  data: z
    .object({
      type: z.string().optional(),
      roomId: z.number().int().positive().optional(),
      recipientId: z.number().int().positive().optional(),
      messageId: z.string().optional(),
    })
    .optional(),
});

export type TVapidPublicKey = z.infer<typeof vapidPublicKeySchema>;
export type TPushSubscription = z.infer<typeof pushSubscriptionSchema>;
export type TPushSubscriptionEndpoint = z.infer<
  typeof pushSubscriptionEndpointSchema
>;
export type TPushNotificationPayload = z.infer<
  typeof pushNotificationPayloadSchema
>;
