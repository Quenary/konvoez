import { createZodDto } from 'nestjs-zod';
import {
  pushNotificationPayloadSchema,
  pushSubscriptionEndpointSchema,
  pushSubscriptionSchema,
  updateUserNotificationSettingsSchema,
  userNotificationSettingsSchema,
  vapidPublicKeySchema,
} from '@konvoez/shared';

export class VapidPublicKeyDto extends createZodDto(vapidPublicKeySchema) {}

export class PushSubscriptionDto extends createZodDto(pushSubscriptionSchema) {}

export class PushSubscriptionEndpointDto extends createZodDto(
  pushSubscriptionEndpointSchema,
) {}

export class PushNotificationPayloadDto extends createZodDto(
  pushNotificationPayloadSchema,
) {}

export class UserNotificationSettingsDto extends createZodDto(
  userNotificationSettingsSchema,
) {}

export class UpdateUserNotificationSettingsDto extends createZodDto(
  updateUserNotificationSettingsSchema,
) {}
