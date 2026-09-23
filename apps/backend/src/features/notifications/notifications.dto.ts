import { createZodDto } from 'nestjs-zod';
import {
  pushNotificationPayloadSchema,
  pushSubscriptionEndpointSchema,
  pushSubscriptionSchema,
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
