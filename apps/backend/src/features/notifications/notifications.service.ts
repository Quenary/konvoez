import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import webPush from 'web-push';
import { pushNotificationBodyMaxLength } from '@konvoez/shared';
import { htmlToPlainText } from '../../shared/utils/html-text.util';
import { AppService } from '../../shared/services/app.service';
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
  ) {
    this.configureVapid();
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

  ensureVapidKeys(): { publicKey: string; privateKey: string } {
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

  getPublicKey(): string {
    return this.ensureVapidKeys().publicKey;
  }

  async saveSubscription(
    user: GetUserDto,
    dto: PushSubscriptionDto,
  ): Promise<void> {
    const endpoint = dto.endpoint;
    const existing = await this.subscriptionRepository.findOne({ endpoint });
    const userRef = this.em.getReference(UserEntity, user.id);
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
      await this.em.flush();
      return;
    }

    this.subscriptionRepository.create(
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

    await this.em.flush();
  }

  async removeSubscription(user: GetUserDto, endpoint: string): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      user: user.id,
      endpoint,
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    this.em.remove(subscription);
    await this.em.flush();
  }

  async getSubscriptionsForUser(
    userId: number,
  ): Promise<PushSubscriptionEntity[]> {
    return this.subscriptionRepository.find({
      user: userId,
      isActive: true,
    });
  }

  async sendNotification(
    userId: number,
    payload: PushNotificationPayloadDto,
  ): Promise<void> {
    const subscriptions = await this.getSubscriptionsForUser(userId);
    if (subscriptions.length === 0) {
      return;
    }

    this.ensureVapidKeys();

    const notificationPayload = JSON.stringify({
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon ?? '/icons/icon-192x192.png',
        tag: payload.tag ?? 'konvoez-message',
        data: payload.data ?? {},
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

    await this.em.flush();
  }

  async sendDirectMessageNotification(
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

    await this.sendNotification(recipientId, {
      title: senderUsername,
      body,
      tag: `direct:${senderId}`,
      data: {
        type: 'direct-message',
        messageId,
        recipientId,
      },
    });
  }
}
