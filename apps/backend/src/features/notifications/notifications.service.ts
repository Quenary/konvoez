import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import webPush from 'web-push';
import { ApiErrorCode, pushNotificationBodyMaxLength } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { htmlToPlainText } from '../../shared/utils/html-text.util';
import { AppService } from '../../shared/services/app.service';
import {
  NotificationsDomainEvents,
  emitNotificationsDomainEvent,
  type IDirectCallNotificationPayload,
  type IDirectMessageNotificationPayload,
} from '@shared/events/notifications.events';
import { GetUserDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import {
  PushNotificationPayloadDto,
  PushSubscriptionDto,
} from './notifications.dto';
import { PushSubscriptionEntity } from './notifications.entity';
import { VapidKeyStorageService } from './vapid-key-storage.service';
import {
  getBrowserName,
  isUnsubscribablePushError,
} from './notifications.utils';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private get em(): EntityManager {
    return this.subscriptionRepository.getEntityManager();
  }

  constructor(
    @InjectRepository(PushSubscriptionEntity)
    private readonly subscriptionRepository: EntityRepository<PushSubscriptionEntity>,
    private readonly appService: AppService,
    private readonly vapidKeyStorageService: VapidKeyStorageService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.configureVapid();
  }

  public ensureVapidKeys(): { publicKey: string; privateKey: string } {
    const storedKeys = this.vapidKeyStorageService.readVapidKeysFromDisk();
    if (storedKeys) {
      this.configureVapid();
      return storedKeys;
    }

    const keys = webPush.generateVAPIDKeys();
    this.vapidKeyStorageService.saveVapidKeysToDisk(keys);
    this.configureVapid();

    return keys;
  }

  public getPublicKey(): string {
    return this.ensureVapidKeys().publicKey;
  }

  public async saveSubscription(
    user: GetUserDto,
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
    user: GetUserDto,
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

  public async deliver(
    userId: number,
    payload: PushNotificationPayloadDto,
  ): Promise<void> {
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
    const em = this.em.fork();
    const subscriptions = await this.getSubscriptionsForUser(userId, em);
    if (subscriptions.length === 0) {
      return;
    }

    this.ensureVapidKeys();

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

  public async sendDirectMessageNotification(
    recipientId: number,
    senderId: number,
    senderUsername: string,
    messagePreview: string,
    messageId: string,
  ): Promise<void> {
    const body = htmlToPlainText(messagePreview, pushNotificationBodyMaxLength);
    if (!body) {
      return;
    }

    const url = `/direct/${senderId}`;
    await this.deliver(recipientId, {
      title: senderUsername,
      body,
      tag: `direct:${senderId}`,
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
    const url = `/direct/${callerId}`;
    await this.deliver(recipientId, {
      title: callerUsername,
      body: 'Входящий голосовой звонок...',
      tag: `call:${callId}`,
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

  @OnEvent(NotificationsDomainEvents.DIRECT_MESSAGE)
  async onDirectMessageNotification(
    payload: IDirectMessageNotificationPayload,
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

  @OnEvent(NotificationsDomainEvents.DIRECT_CALL)
  async onDirectCallNotification(
    payload: IDirectCallNotificationPayload,
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

  private configureVapid(): void {
    const storedKeys = this.vapidKeyStorageService.readVapidKeysFromDisk();
    if (!storedKeys) {
      return;
    }

    webPush.setVapidDetails(
      `mailto:${this.appService.VAPID_EMAIL}`,
      storedKeys.publicKey,
      storedKeys.privateKey,
    );
  }
}
