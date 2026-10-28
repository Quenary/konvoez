import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '../../shared/types/base.entity';
import { UserEntitySchema } from '../users/users.entity';

export const PushSubscriptionEntitySchema = defineEntity({
  name: 'PushSubscriptionEntity',
  tableName: 'push_subscriptions',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    user: () => p.manyToOne(UserEntitySchema).index().deleteRule('cascade'),
    endpoint: p.string().length(2048).index().unique(),
    auth: p.string().length(512),
    p256dh: p.string().length(2048),
    browser: p.string().length(256).nullable(),
    userAgent: p.string().length(512).nullable(),
    isActive: p.boolean().default(true),
    lastUsedAt: p.datetime().nullable(),
  },
});

export class PushSubscriptionEntity
  extends PushSubscriptionEntitySchema.class {}

PushSubscriptionEntitySchema.setClass(PushSubscriptionEntity);

export const UserNotificationSettingsEntitySchema = defineEntity({
  name: 'UserNotificationSettingsEntity',
  tableName: 'user_notification_settings',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    user: () =>
      p.manyToOne(UserEntitySchema).index(false).unique().deleteRule('cascade'),
    directMessages: p.boolean().default(true),
    directCalls: p.boolean().default(true),
    replies: p.boolean().default(true),
    reactions: p.boolean().default(true),
    mentionUsername: p.boolean().default(true),
    mentionRole: p.boolean().default(true),
    mentionEveryone: p.boolean().default(true),
  },
});

export class UserNotificationSettingsEntity
  extends UserNotificationSettingsEntitySchema.class {}

UserNotificationSettingsEntitySchema.setClass(UserNotificationSettingsEntity);
