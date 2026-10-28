import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import webPush from 'web-push';
import {
  ApiErrorCode,
  DEFAULT_USER_NOTIFICATION_SETTINGS,
  ESettingKey,
  buildCallNotificationTopic,
  buildMessageNotificationTopic,
  buildReactionNotificationTopic,
  pushNotificationBodyMaxLength,
  shouldDeliverMentionNotification,
  toVapidSubject,
  type TUserNotificationSettings,
} from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { htmlToPlainText } from '../../shared/utils/html-text.util';
import { SettingsService } from '../settings/settings.service';
import {
  NotificationsDomainEvents,
  emitNotificationsDomainEvent,
} from './notifications.events';
import {
  TextRoomsDomainEvents,
  type TTextRoomDirectMessageCreatedPayload,
  type TTextRoomMentionCreatedPayload,
  type TTextRoomReactionAddedPayload,
  type TTextRoomReplyCreatedPayload,
  type TTextRoomsDomainPayloadMap,
} from '../text-rooms/text-rooms.events';
import {
  VoiceRoomsDomainEvents,
  type TVoiceRoomDirectCallIncomingPayload,
  type TVoiceRoomsDomainPayloadMap,
} from '../voice-rooms/voice-rooms.events';
import { GetUserSafeDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import {
  PushNotificationPayloadDto,
  PushSubscriptionDto,
  UpdateUserNotificationSettingsDto,
} from './notifications.dto';
import {
  PushSubscriptionEntity,
  UserNotificationSettingsEntity,
} from './notifications.entity';
import { VapidKeyStorageService } from './vapid-key-storage.service';
import {
  getBrowserName,
  isUnsubscribablePushError,
} from './notifications.utils';

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly recentDeliveries = new Set<string>();
  private readonly deliveryTimers = new Set<ReturnType<typeof setTimeout>>();

  public onModuleDestroy(): void {
    for (const timer of this.deliveryTimers) {
      clearTimeout(timer);
    }
    this.deliveryTimers.clear();
    this.recentDeliveries.clear();
  }

  private get em(): EntityManager {
    return this.subscriptionRepository.getEntityManager();
  }

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionRepository: EntityRepository<PushSubscriptionEntity>,
    @InjectRepository(UserNotificationSettingsEntity)
    private readonly userSettingsRepository: EntityRepository<UserNotificationSettingsEntity>,
    private readonly settingsService: SettingsService,
    private readonly vapidKeyStorageService: VapidKeyStorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async resolveVapidSubject(): Promise<string | null> {
    return toVapidSubject(
      await this.settingsService.getValue(ESettingKey.VAPID_EMAIL),
    );
  }

  public ensureVapidKeys(): { publicKey: string; privateKey: string } {
    const storedKeys = this.vapidKeyStorageService.readVapidKeysFromDisk();
    if (storedKeys) {
      return storedKeys;
    }

    const keys = webPush.generateVAPIDKeys();
    this.vapidKeyStorageService.saveVapidKeysToDisk(keys);
    return keys;
  }

  public async getPublicKeyIfEnabled(): Promise<string | null> {
    const subject = await this.resolveVapidSubject();
    if (!subject) {
      return null;
    }
    return this.ensureVapidKeys().publicKey;
  }

  public async saveSubscription(
    user: GetUserSafeDto,
    dto: PushSubscriptionDto,
  ): Promise<void> {
    const em = this.em.fork();
    const repo = em.getRepository(PushSubscriptionEntity);
    const endpoint = dto.endpoint;
    const existing = await repo.findOne({ endpoint });
    const userRef = em.getReference(UserEntity, user.id);
    const userAgent = dto.userAgent ?? null;

    if (existing) {
      existing.user = userRef;
      existing.auth = dto.keys.auth;
      existing.p256dh = dto.keys.p256dh;
      existing.isActive = true;
      existing.lastUsedAt = new Date();
      existing.userAgent = userAgent ?? existing.userAgent ?? null;
      existing.browser =
        getBrowserName(userAgent ?? undefined) ?? existing.browser;
      await em.flush();
      return;
    }

    repo.create(
      {
        user: userRef,
        endpoint,
        auth: dto.keys.auth,
        p256dh: dto.keys.p256dh,
        userAgent,
        browser: getBrowserName(userAgent ?? undefined),
        isActive: true,
        lastUsedAt: new Date(),
      },
      { persist: true },
    );

    await em.flush();
  }

  public async removeSubscription(
    user: GetUserSafeDto,
    endpoint: string,
  ): Promise<void> {
    const em = this.em.fork();
    const repo = em.getRepository(PushSubscriptionEntity);
    const subscription = await repo.findOne({
      user: user.id,
      endpoint,
    });

    if (!subscription) {
      throw AppException.notFound(
        ApiErrorCode.PUSH_SUBSCRIPTION_NOT_FOUND,
        'Subscription not found',
      );
    }

    em.remove(subscription);
    await em.flush();
  }

  public async getSubscriptionsForUser(
    userId: number,
    em: EntityManager = this.em.fork(),
  ): Promise<PushSubscriptionEntity[]> {
    const repo = em.getRepository(PushSubscriptionEntity);
    return repo.find({
      user: userId,
      isActive: true,
    });
  }

  public toSettingsDto(
    entity: UserNotificationSettingsEntity | null,
  ): TUserNotificationSettings {
    if (!entity) {
      return { ...DEFAULT_USER_NOTIFICATION_SETTINGS };
    }
    return {
      directMessages: entity.directMessages,
      directCalls: entity.directCalls,
      replies: entity.replies,
      reactions: entity.reactions,
      mentions: {
        username: entity.mentionUsername,
        role: entity.mentionRole,
        everyone: entity.mentionEveryone,
      },
    };
  }

  public async getUserNotificationSettings(
    userId: number,
  ): Promise<TUserNotificationSettings> {
    const em = this.em.fork();
    const repo = em.getRepository(UserNotificationSettingsEntity);
    const existing = await repo.findOne({ user: userId });
    return this.toSettingsDto(existing);
  }

  public async getUserNotificationSettingsBatch(
    userIds: number[],
  ): Promise<Map<number, TUserNotificationSettings>> {
    const result = new Map<number, TUserNotificationSettings>();
    if (userIds.length === 0) {
      return result;
    }

    const em = this.em.fork();
    const repo = em.getRepository(UserNotificationSettingsEntity);
    const rows = await repo.find({ user: { $in: userIds } });
    const rowsByUserId = new Map<number, UserNotificationSettingsEntity>();
    for (const row of rows) {
      rowsByUserId.set(row.user.id, row);
    }

    for (const id of userIds) {
      const row = rowsByUserId.get(id) ?? null;
      result.set(id, this.toSettingsDto(row));
    }

    return result;
  }

  public async updateUserNotificationSettings(
    user: GetUserSafeDto,
    dto: UpdateUserNotificationSettingsDto,
  ): Promise<TUserNotificationSettings> {
    const em = this.em.fork();
    const repo = em.getRepository(UserNotificationSettingsEntity);
    const existing = await repo.findOne({ user: user.id });

    const mergeFields: (keyof UserNotificationSettingsEntity & string)[] = [
      'updatedAt',
    ];
    if (dto.directMessages !== undefined) {
      mergeFields.push('directMessages');
    }
    if (dto.directCalls !== undefined) {
      mergeFields.push('directCalls');
    }
    if (dto.replies !== undefined) {
      mergeFields.push('replies');
    }
    if (dto.reactions !== undefined) {
      mergeFields.push('reactions');
    }
    if (dto.mentions?.username !== undefined) {
      mergeFields.push('mentionUsername');
    }
    if (dto.mentions?.role !== undefined) {
      mergeFields.push('mentionRole');
    }
    if (dto.mentions?.everyone !== undefined) {
      mergeFields.push('mentionEveryone');
    }

    const userRef = em.getReference(UserEntity, user.id);
    const settings = await em.upsert(
      UserNotificationSettingsEntity,
      {
        user: userRef,
        directMessages:
          dto.directMessages ??
          existing?.directMessages ??
          DEFAULT_USER_NOTIFICATION_SETTINGS.directMessages,
        directCalls:
          dto.directCalls ??
          existing?.directCalls ??
          DEFAULT_USER_NOTIFICATION_SETTINGS.directCalls,
        replies:
          dto.replies ??
          existing?.replies ??
          DEFAULT_USER_NOTIFICATION_SETTINGS.replies,
        reactions:
          dto.reactions ??
          existing?.reactions ??
          DEFAULT_USER_NOTIFICATION_SETTINGS.reactions,
        mentionUsername:
          dto.mentions?.username ??
          existing?.mentionUsername ??
          DEFAULT_USER_NOTIFICATION_SETTINGS.mentions.username,
        mentionRole:
          dto.mentions?.role ??
          existing?.mentionRole ??
          DEFAULT_USER_NOTIFICATION_SETTINGS.mentions.role,
        mentionEveryone:
          dto.mentions?.everyone ??
          existing?.mentionEveryone ??
          DEFAULT_USER_NOTIFICATION_SETTINGS.mentions.everyone,
      },
      {
        onConflictFields: ['user'],
        onConflictAction: 'merge',
        onConflictMergeFields: mergeFields,
      },
    );

    await em.flush();
    return this.toSettingsDto(settings);
  }

  public async deliver(
    userId: number,
    payload: PushNotificationPayloadDto,
  ): Promise<void> {
    const messageId = payload.data?.messageId;
    if (messageId) {
      const isReaction = payload.data?.type === 'reaction';
      const key = isReaction
        ? `${userId}:reaction:${payload.data?.senderId ?? 0}:${messageId}`
        : `${userId}:${messageId}`;
      if (this.recentDeliveries.has(key)) {
        return;
      }
      this.recentDeliveries.add(key);
      const timer = setTimeout(() => {
        this.recentDeliveries.delete(key);
        this.deliveryTimers.delete(timer);
      }, 5000);
      timer.unref?.();
      this.deliveryTimers.add(timer);
    }

    emitNotificationsDomainEvent(
      this.eventEmitter,
      NotificationsDomainEvents.DELIVER,
      { userId, payload },
    );
    await this.sendWebPush(userId, payload);
  }

  private async sendWebPush(
    userId: number,
    payload: PushNotificationPayloadDto,
  ): Promise<void> {
    const subject = await this.resolveVapidSubject();
    if (!subject) {
      return;
    }

    const em = this.em.fork();
    const subscriptions = await this.getSubscriptionsForUser(userId, em);
    if (subscriptions.length === 0) {
      return;
    }

    const keys = this.ensureVapidKeys();

    const data = payload.data ? { ...payload.data } : {};
    if (data.url && !data.onActionClick) {
      data.onActionClick = {
        default: {
          operation: 'focusLastFocusedOrOpen',
          url: data.url,
        },
      };
    }

    const notificationPayload = JSON.stringify({
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? '/icons/icon-192x192.png',
        tag: payload.tag ?? 'konvoez-message',
        data,
      },
    });

    const topic = payload.topic ?? payload.tag;
    const requestOptions: webPush.RequestOptions = {
      vapidDetails: {
        subject,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      },
      TTL: 2419200,
      urgency: 'high',
    };
    if (topic) {
      requestOptions.topic = topic;
    }

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                auth: subscription.auth,
                p256dh: subscription.p256dh,
              },
            },
            notificationPayload,
            requestOptions,
          );

          subscription.lastUsedAt = new Date();
        } catch (error) {
          if (isUnsubscribablePushError(error)) {
            subscription.isActive = false;
            return;
          }

          this.logger.error(
            'Push notification delivery failed',
            error instanceof Error ? error.stack : String(error),
          );
        }
      }),
    );

    await em.flush();
  }

  public async dismiss(
    userId: number,
    dismissal: {
      tag: string;
      topic?: string;
      messageId?: string;
    },
  ): Promise<void> {
    emitNotificationsDomainEvent(
      this.eventEmitter,
      NotificationsDomainEvents.DISMISS,
      { userId, ...dismissal },
    );
    await this.sendWebPushDismiss(userId, dismissal);
  }

  private async sendWebPushDismiss(
    userId: number,
    dismissal: {
      tag: string;
      topic?: string;
      messageId?: string;
    },
  ): Promise<void> {
    const subject = await this.resolveVapidSubject();
    if (!subject) {
      return;
    }

    const em = this.em.fork();
    const subscriptions = await this.getSubscriptionsForUser(userId, em);
    if (subscriptions.length === 0) {
      return;
    }

    const keys = this.ensureVapidKeys();
    const topic = dismissal.topic ?? dismissal.tag;

    const payload = JSON.stringify({
      action: 'dismiss',
      tag: dismissal.tag,
      messageId: dismissal.messageId,
    });

    const requestOptions: webPush.RequestOptions = {
      vapidDetails: {
        subject,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      },
      topic,
      TTL: 0,
      urgency: 'normal',
    };

    await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                auth: subscription.auth,
                p256dh: subscription.p256dh,
              },
            },
            payload,
            requestOptions,
          );

          subscription.lastUsedAt = new Date();
        } catch (error) {
          if (isUnsubscribablePushError(error)) {
            subscription.isActive = false;
            return;
          }

          this.logger.error(
            'Push notification dismissal delivery failed',
            error instanceof Error ? error.stack : String(error),
          );
        }
      }),
    );

    await em.flush();
  }

  public async sendDirectMessageNotification(
    recipientId: number,
    senderId: number,
    senderUsername: string,
    messagePreview: string,
    messageId: string,
  ): Promise<void> {
    const settings = await this.getUserNotificationSettings(recipientId);
    if (!settings.directMessages) {
      return;
    }

    const body = htmlToPlainText(messagePreview, pushNotificationBodyMaxLength);
    if (!body) {
      return;
    }

    const topic = buildMessageNotificationTopic(messageId);
    const url = `/direct/${senderId}`;
    await this.deliver(recipientId, {
      title: senderUsername,
      body,
      tag: topic,
      topic,
      data: {
        type: 'direct-message',
        messageId,
        recipientId,
        senderId,
        url,
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen',
            url,
          },
        },
      },
    });
  }

  public async sendDirectCallNotification(
    recipientId: number,
    callerId: number,
    callerUsername: string,
    callId: string,
  ): Promise<void> {
    const settings = await this.getUserNotificationSettings(recipientId);
    if (!settings.directCalls) {
      return;
    }

    const topic = buildCallNotificationTopic(callId);
    const url = `/direct/${callerId}`;
    await this.deliver(recipientId, {
      title: callerUsername,
      body: 'Входящий голосовой звонок...',
      tag: topic,
      topic,
      data: {
        type: 'direct-call',
        callId,
        callerId,
        recipientId,
        url,
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen',
            url,
          },
        },
      },
    });
  }

  public async sendMentionNotification(
    payload: TTextRoomMentionCreatedPayload,
  ): Promise<void> {
    const body = htmlToPlainText(
      payload.messagePreview,
      pushNotificationBodyMaxLength,
    );
    if (!body || payload.recipients.length === 0) {
      return;
    }

    const recipients = payload.recipients;
    const settingsMap = await this.getUserNotificationSettingsBatch(
      recipients.map((r) => r.userId),
    );
    const eligibleRecipients = recipients.filter((r) => {
      const settings =
        settingsMap.get(r.userId) ?? DEFAULT_USER_NOTIFICATION_SETTINGS;
      return shouldDeliverMentionNotification(settings, r.types);
    });

    if (eligibleRecipients.length === 0) {
      return;
    }

    const topic = buildMessageNotificationTopic(payload.messageId);
    const title = `${payload.senderUsername} · #${payload.roomName}`;
    const url = `/text-room/${payload.roomId}?message=${payload.messageId}`;

    await Promise.allSettled(
      eligibleRecipients.map((recipient) =>
        this.deliver(recipient.userId, {
          title,
          body,
          tag: topic,
          topic,
          data: {
            type: 'mention',
            roomId: payload.roomId,
            messageId: payload.messageId,
            senderId: payload.senderId,
            url,
            onActionClick: {
              default: {
                operation: 'focusLastFocusedOrOpen',
                url,
              },
            },
          },
        }),
      ),
    );
  }

  public async sendReplyNotification(
    payload: TTextRoomReplyCreatedPayload,
  ): Promise<void> {
    const settings = await this.getUserNotificationSettings(
      payload.recipientId,
    );
    if (!settings.replies) {
      return;
    }

    const body = htmlToPlainText(
      payload.messagePreview,
      pushNotificationBodyMaxLength,
    );
    if (!body) {
      return;
    }

    const topic = buildMessageNotificationTopic(payload.messageId);
    const title = `${payload.senderUsername} · #${payload.roomName}`;
    const url = `/text-room/${payload.roomId}?message=${payload.messageId}`;

    await this.deliver(payload.recipientId, {
      title,
      body,
      tag: topic,
      topic,
      data: {
        type: 'reply',
        roomId: payload.roomId,
        messageId: payload.messageId,
        senderId: payload.senderId,
        url,
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen',
            url,
          },
        },
      },
    });
  }

  public async sendReactionNotification(
    payload: TTextRoomReactionAddedPayload,
  ): Promise<void> {
    const settings = await this.getUserNotificationSettings(
      payload.recipientId,
    );
    if (!settings.reactions) {
      return;
    }

    const plain = htmlToPlainText(
      payload.messagePreview,
      pushNotificationBodyMaxLength,
    );
    const body = plain
      ? `${payload.emoji} ${plain}`.slice(0, pushNotificationBodyMaxLength)
      : payload.emoji;

    const topic = buildReactionNotificationTopic(
      payload.messageId,
      payload.senderId,
    );
    const title = payload.roomName
      ? `${payload.senderUsername} · #${payload.roomName}`
      : payload.senderUsername;
    const url = payload.roomId
      ? `/text-room/${payload.roomId}?message=${payload.messageId}`
      : `/direct/${payload.senderId}`;

    await this.deliver(payload.recipientId, {
      title,
      body,
      tag: topic,
      topic,
      data: {
        type: 'reaction',
        roomId: payload.roomId ?? undefined,
        messageId: payload.messageId,
        senderId: payload.senderId,
        url,
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen',
            url,
          },
        },
      },
    });
  }

  @OnEvent(TextRoomsDomainEvents.REACTION_ADDED)
  async onReactionNotification(
    payload: TTextRoomReactionAddedPayload,
  ): Promise<void> {
    try {
      await this.sendReactionNotification(payload);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to send reaction push notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(TextRoomsDomainEvents.REPLY_CREATED)
  async onReplyNotification(
    payload: TTextRoomReplyCreatedPayload,
  ): Promise<void> {
    try {
      await this.sendReplyNotification(payload);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to send reply push notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(TextRoomsDomainEvents.MENTION_CREATED)
  async onMentionNotification(
    payload: TTextRoomMentionCreatedPayload,
  ): Promise<void> {
    try {
      await this.sendMentionNotification(payload);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to send mention push notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(TextRoomsDomainEvents.DIRECT_MESSAGE_CREATED)
  async onDirectMessageNotification(
    payload: TTextRoomDirectMessageCreatedPayload,
  ): Promise<void> {
    try {
      await this.sendDirectMessageNotification(
        payload.recipientId,
        payload.senderId,
        payload.senderUsername,
        payload.messagePreview,
        payload.messageId,
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to send direct message push notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(VoiceRoomsDomainEvents.DIRECT_CALL_INCOMING)
  async onDirectCallNotification(
    payload: TVoiceRoomDirectCallIncomingPayload,
  ): Promise<void> {
    try {
      await this.sendDirectCallNotification(
        payload.recipientId,
        payload.callerId,
        payload.callerUsername,
        payload.callId,
      );
    } catch (error: unknown) {
      this.logger.error(
        'Failed to send direct call push notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(VoiceRoomsDomainEvents.DIRECT_CALL_ENDED)
  async onDirectCallEnded(
    payload: TVoiceRoomsDomainPayloadMap[typeof VoiceRoomsDomainEvents.DIRECT_CALL_ENDED],
  ): Promise<void> {
    try {
      const topic = buildCallNotificationTopic(payload.callId);
      await this.dismiss(payload.recipientId, {
        tag: topic,
        topic,
        messageId: payload.callId,
      });
    } catch (error: unknown) {
      this.logger.error(
        'Failed to dismiss direct call push notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(TextRoomsDomainEvents.MESSAGE_DELETED)
  async onMessageDeleted(
    payload: TTextRoomsDomainPayloadMap[typeof TextRoomsDomainEvents.MESSAGE_DELETED],
  ): Promise<void> {
    try {
      const topic = buildMessageNotificationTopic(payload.id);
      const recipientIds = payload.recipientUserIds ?? [];
      const dismissals: Promise<void>[] = recipientIds.map((userId) =>
        this.dismiss(userId, {
          tag: topic,
          topic,
          messageId: payload.id,
        }),
      );
      if (payload.senderId) {
        dismissals.push(
          this.dismiss(payload.senderId, {
            tag: topic,
            topic,
            messageId: payload.id,
          }),
        );
        for (const reactorId of payload.reactionSenderIds ?? []) {
          const rxTopic = buildReactionNotificationTopic(payload.id, reactorId);
          dismissals.push(
            this.dismiss(payload.senderId, {
              tag: rxTopic,
              topic: rxTopic,
              messageId: payload.id,
            }),
          );
        }
      }
      await Promise.allSettled(dismissals);
    } catch (error: unknown) {
      this.logger.error(
        'Failed to process message deletion notifications',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  @OnEvent(TextRoomsDomainEvents.REACTION_REMOVED)
  async onReactionRemoved(
    payload: TTextRoomsDomainPayloadMap[typeof TextRoomsDomainEvents.REACTION_REMOVED],
  ): Promise<void> {
    try {
      const topic = buildReactionNotificationTopic(
        payload.messageId,
        payload.senderId,
      );
      await this.dismiss(payload.recipientId, {
        tag: topic,
        topic,
      });
    } catch (error: unknown) {
      this.logger.error(
        'Failed to process reaction removal notification',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
