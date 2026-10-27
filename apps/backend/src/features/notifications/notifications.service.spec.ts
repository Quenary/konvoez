jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@mikro-orm/core', () => {
  const createProxy = (): unknown =>
    new Proxy(() => createProxy(), {
      get: () => createProxy(),
      apply: () => createProxy(),
    });
  return {
    defineEntity: () => ({
      class: class {},
      setClass: () => undefined,
      addHook: () => undefined,
    }),
    p: createProxy(),
  };
});
jest.mock('web-push', () => ({
  __esModule: true,
  default: {
    setVapidDetails: jest.fn(),
    generateVAPIDKeys: jest.fn(() => ({
      publicKey: 'generated-pub',
      privateKey: 'generated-priv',
    })),
    sendNotification: jest.fn().mockResolvedValue(undefined),
  },
}));

import webPush from 'web-push';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorCode, EUserRole } from '@konvoez/shared';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { NotificationsDomainEvents } from './notifications.events';
import { TextRoomsDomainEvents } from '../text-rooms/text-rooms.events';
import { VoiceRoomsDomainEvents } from '../voice-rooms/voice-rooms.events';
import { GetUserSafeDto } from '../users/users.dto';
import {
  PushSubscriptionEntity,
  UserNotificationSettingsEntity,
} from './notifications.entity';
import { NotificationsService } from './notifications.service';
import { SettingsService } from '../settings/settings.service';
import { VapidKeyStorageService } from './vapid-key-storage.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let subscriptionRepository: jest.Mocked<
    EntityRepository<PushSubscriptionEntity>
  >;
  let userSettingsRepository: jest.Mocked<
    EntityRepository<UserNotificationSettingsEntity>
  >;
  let vapidKeyStorageService: jest.Mocked<
    Pick<
      VapidKeyStorageService,
      'readVapidKeysFromDisk' | 'saveVapidKeysToDisk'
    >
  >;
  let em: jest.Mocked<EntityManager>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockUser: GetUserSafeDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    role: EUserRole.MEMBER,
    isOwner: false,
    roles: [],
    permissions: [],
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const dto = {
    endpoint: 'https://push.example/sub-1',
    keys: {
      auth: 'auth-key',
      p256dh: 'p256dh-key',
    },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    em = {
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      remove: jest.fn(),
      getReference: jest.fn().mockImplementation((_entity, id) => ({ id })),
      fork: jest.fn(),
      getRepository: jest.fn(),
      upsert: jest.fn().mockImplementation((_entity, data) => data),
    } as unknown as jest.Mocked<EntityManager>;

    subscriptionRepository = {
      getEntityManager: jest.fn().mockReturnValue(em),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
    } as unknown as jest.Mocked<EntityRepository<PushSubscriptionEntity>>;

    userSettingsRepository = {
      getEntityManager: jest.fn().mockReturnValue(em),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => data),
    } as unknown as jest.Mocked<
      EntityRepository<UserNotificationSettingsEntity>
    >;

    em.fork.mockReturnValue(em);
    em.getRepository.mockImplementation((entity: unknown) => {
      if (entity === UserNotificationSettingsEntity) {
        return userSettingsRepository as unknown as EntityRepository<object>;
      }
      return subscriptionRepository as unknown as EntityRepository<object>;
    });

    vapidKeyStorageService = {
      readVapidKeysFromDisk: jest.fn().mockReturnValue({
        publicKey: 'stored-pub',
        privateKey: 'stored-priv',
      }),
      saveVapidKeysToDisk: jest.fn(),
    };

    eventEmitter = {
      emit: jest.fn(),
    } as unknown as jest.Mocked<EventEmitter2>;

    service = new NotificationsService(
      subscriptionRepository,
      userSettingsRepository,
      {
        getValue: jest.fn().mockResolvedValue('konvoez@invalid.email'),
      } as unknown as SettingsService,
      vapidKeyStorageService as unknown as VapidKeyStorageService,
      eventEmitter,
    );
  });

  describe('saveSubscription', () => {
    it('should create a new subscription for the user', async () => {
      subscriptionRepository.findOne.mockResolvedValue(null);

      await service.saveSubscription(mockUser, dto);

      expect(subscriptionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: dto.endpoint,
          auth: dto.keys.auth,
          p256dh: dto.keys.p256dh,
          browser: 'chrome',
          isActive: true,
        }),
        { persist: true },
      );
      expect(em.flush).toHaveBeenCalledTimes(1);
    });

    it('should reassign an existing endpoint to the current user', async () => {
      const existing = {
        user: { id: 99 },
        endpoint: dto.endpoint,
        auth: 'old-auth',
        p256dh: 'old-p256',
        isActive: false,
        userAgent: 'old-agent',
        browser: 'firefox',
      } as unknown as PushSubscriptionEntity;
      subscriptionRepository.findOne.mockResolvedValue(existing);

      await service.saveSubscription(mockUser, dto);

      expect(existing.user).toEqual({ id: mockUser.id });
      expect(existing.auth).toBe(dto.keys.auth);
      expect(existing.p256dh).toBe(dto.keys.p256dh);
      expect(existing.isActive).toBe(true);
      expect(existing.browser).toBe('chrome');
      expect(subscriptionRepository.create).not.toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeSubscription', () => {
    it('should throw when the subscription does not belong to the user', async () => {
      subscriptionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.removeSubscription(mockUser, dto.endpoint),
      ).rejects.toMatchObject({
        code: ApiErrorCode.PUSH_SUBSCRIPTION_NOT_FOUND,
      });
    });
  });

  describe('deliver', () => {
    it('should emit DELIVER domain event and send to every active subscription', async () => {
      const first = {
        endpoint: 'https://push.example/1',
        auth: 'a1',
        p256dh: 'p1',
        isActive: true,
        lastUsedAt: null,
      } as unknown as PushSubscriptionEntity;
      const second = {
        endpoint: 'https://push.example/2',
        auth: 'a2',
        p256dh: 'p2',
        isActive: true,
        lastUsedAt: null,
      } as unknown as PushSubscriptionEntity;
      subscriptionRepository.find.mockResolvedValue([first, second]);

      const payload = {
        title: 'Alice',
        body: 'Hello',
      };

      await service.deliver(2, payload);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationsDomainEvents.DELIVER,
        { userId: 2, payload },
      );
      expect(webPush.sendNotification).toHaveBeenCalledTimes(2);
      expect(webPush.sendNotification).toHaveBeenCalledWith(
        {
          endpoint: first.endpoint,
          keys: { auth: first.auth, p256dh: first.p256dh },
        },
        expect.stringContaining('"notification"'),
        {
          vapidDetails: {
            subject: 'mailto:konvoez@invalid.email',
            publicKey: 'stored-pub',
            privateKey: 'stored-priv',
          },
        },
      );
      expect(em.flush).toHaveBeenCalledTimes(1);
      expect(first.lastUsedAt).toBeInstanceOf(Date);
      expect(second.lastUsedAt).toBeInstanceOf(Date);
    });

    it('should emit DELIVER event even when user has no active push subscriptions', async () => {
      subscriptionRepository.find.mockResolvedValue([]);
      const payload = { title: 'Alice', body: 'Hello' };

      await service.deliver(2, payload);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationsDomainEvents.DELIVER,
        { userId: 2, payload },
      );
      expect(webPush.sendNotification).not.toHaveBeenCalled();
    });

    it('should deactivate gone subscriptions and still flush once', async () => {
      const gone = {
        endpoint: 'https://push.example/gone',
        auth: 'a1',
        p256dh: 'p1',
        isActive: true,
      } as unknown as PushSubscriptionEntity;
      subscriptionRepository.find.mockResolvedValue([gone]);
      (webPush.sendNotification as jest.Mock).mockRejectedValueOnce({
        statusCode: 410,
      });

      await service.deliver(2, {
        title: 'Alice',
        body: 'Hello',
      });

      expect(gone.isActive).toBe(false);
      expect(em.flush).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendDirectMessageNotification', () => {
    it('should send a plain-text preview and drop markup', async () => {
      subscriptionRepository.find.mockResolvedValue([
        {
          endpoint: 'https://push.example/1',
          auth: 'a1',
          p256dh: 'p1',
          isActive: true,
        } as unknown as PushSubscriptionEntity,
      ]);

      await service.sendDirectMessageNotification(
        2,
        1,
        'alice',
        '<p>Hello</p>',
        'message-id',
      );

      const payload = JSON.parse(
        (webPush.sendNotification as jest.Mock).mock.calls[0][1],
      );
      expect(payload.notification.title).toBe('alice');
      expect(payload.notification.body).toBe('Hello');
    });

    it('should truncate long bodies to the push preview limit', async () => {
      subscriptionRepository.find.mockResolvedValue([
        {
          endpoint: 'https://push.example/1',
          auth: 'a1',
          p256dh: 'p1',
          isActive: true,
        } as unknown as PushSubscriptionEntity,
      ]);

      await service.sendDirectMessageNotification(
        2,
        1,
        'alice',
        'a'.repeat(500),
        'message-id',
      );

      const payload = JSON.parse(
        (webPush.sendNotification as jest.Mock).mock.calls[0][1],
      );
      expect(payload.notification.body).toHaveLength(200);
      expect(payload.notification.body.endsWith('...')).toBe(true);
    });

    it('should skip sending when the body is empty after stripping markup', async () => {
      subscriptionRepository.find.mockResolvedValue([
        {
          endpoint: 'https://push.example/1',
          auth: 'a1',
          p256dh: 'p1',
          isActive: true,
        } as unknown as PushSubscriptionEntity,
      ]);

      await service.sendDirectMessageNotification(
        2,
        1,
        'alice',
        '<p></p>',
        'message-id',
      );

      expect(webPush.sendNotification).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should group notifications by sender', async () => {
      subscriptionRepository.find.mockResolvedValue([
        {
          endpoint: 'https://push.example/1',
          auth: 'a1',
          p256dh: 'p1',
          isActive: true,
        } as unknown as PushSubscriptionEntity,
      ]);

      await service.sendDirectMessageNotification(
        2,
        1,
        'alice',
        'Hello there',
        'message-id',
      );

      const payload = JSON.parse(
        (webPush.sendNotification as jest.Mock).mock.calls[0][1],
      );
      expect(payload.notification.tag).toBe('direct:1');
      expect(payload.notification.title).toBe('alice');
      expect(payload.notification.body).toBe('Hello there');
      expect(payload.notification.data.senderId).toBe(1);
      expect(payload.notification.data.recipientId).toBe(2);
      expect(payload.notification.data.url).toBe('/direct/1');
      expect(payload.notification.data.onActionClick?.default).toEqual({
        operation: 'focusLastFocusedOrOpen',
        url: '/direct/1',
      });
    });
  });

  describe('sendDirectCallNotification', () => {
    it('should send incoming call notification with url and onActionClick', async () => {
      subscriptionRepository.find.mockResolvedValue([
        {
          endpoint: 'https://push.example/1',
          auth: 'a1',
          p256dh: 'p1',
          isActive: true,
        } as unknown as PushSubscriptionEntity,
      ]);

      await service.sendDirectCallNotification(2, 1, 'alice', 'call-123-abc');

      const payload = JSON.parse(
        (webPush.sendNotification as jest.Mock).mock.calls[0][1],
      );
      expect(payload.notification.tag).toBe('call:call-123-abc');
      expect(payload.notification.title).toBe('alice');
      expect(payload.notification.body).toBe('Входящий голосовой звонок...');
      expect(payload.notification.data.type).toBe('direct-call');
      expect(payload.notification.data.callId).toBe('call-123-abc');
      expect(payload.notification.data.callerId).toBe(1);
      expect(payload.notification.data.recipientId).toBe(2);
      expect(payload.notification.data.url).toBe('/direct/1');
      expect(payload.notification.data.onActionClick?.default).toEqual({
        operation: 'focusLastFocusedOrOpen',
        url: '/direct/1',
      });
    });
  });

  describe('getSubscriptionsForUser', () => {
    it('should use a forked EntityManager when no em is provided', async () => {
      subscriptionRepository.find.mockResolvedValue([]);

      const result = await service.getSubscriptionsForUser(2);

      expect(em.fork).toHaveBeenCalled();
      expect(em.getRepository).toHaveBeenCalledWith(PushSubscriptionEntity);
      expect(subscriptionRepository.find).toHaveBeenCalledWith({
        user: 2,
        isActive: true,
      });
      expect(result).toEqual([]);
    });

    it('should use the provided EntityManager when passed', async () => {
      const customRepo = {
        find: jest.fn().mockResolvedValue([]),
      } as unknown as EntityRepository<PushSubscriptionEntity>;
      const customEm = {
        getRepository: jest.fn().mockReturnValue(customRepo),
      } as unknown as EntityManager;

      const result = await service.getSubscriptionsForUser(2, customEm);

      expect(customEm.getRepository).toHaveBeenCalledWith(
        PushSubscriptionEntity,
      );
      expect(customRepo.find).toHaveBeenCalledWith({
        user: 2,
        isActive: true,
      });
      expect(result).toEqual([]);
    });
  });

  describe('onDirectMessageNotification', () => {
    it('is registered for DIRECT_MESSAGE_CREATED event', () => {
      const metadata = Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        NotificationsService.prototype.onDirectMessageNotification,
      );
      const events = metadata.map((m: { event: string }) => m.event);
      expect(events).toContain(TextRoomsDomainEvents.DIRECT_MESSAGE_CREATED);
    });

    it('should delegate to sendDirectMessageNotification with payload data', async () => {
      const sendSpy = jest
        .spyOn(service, 'sendDirectMessageNotification')
        .mockResolvedValue();

      await service.onDirectMessageNotification({
        recipientId: 2,
        senderId: 1,
        senderUsername: 'alice',
        messagePreview: 'Hi',
        messageId: 'msg-1',
      });

      expect(sendSpy).toHaveBeenCalledWith(2, 1, 'alice', 'Hi', 'msg-1');
    });

    it('should catch and log error if sending direct message notification fails', async () => {
      const error = new Error('Send failed');
      jest
        .spyOn(service, 'sendDirectMessageNotification')
        .mockRejectedValue(error);
      const loggerSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.onDirectMessageNotification({
        recipientId: 2,
        senderId: 1,
        senderUsername: 'alice',
        messagePreview: 'Hi',
        messageId: 'msg-1',
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to send direct message push notification',
        error.stack,
      );
    });
  });

  describe('onDirectCallNotification', () => {
    it('is registered for DIRECT_CALL_INCOMING event', () => {
      const metadata = Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        NotificationsService.prototype.onDirectCallNotification,
      );
      const events = metadata.map((m: { event: string }) => m.event);
      expect(events).toContain(VoiceRoomsDomainEvents.DIRECT_CALL_INCOMING);
    });

    it('should delegate to sendDirectCallNotification with payload data', async () => {
      const sendSpy = jest
        .spyOn(service, 'sendDirectCallNotification')
        .mockResolvedValue();

      await service.onDirectCallNotification({
        recipientId: 2,
        callerId: 1,
        callerUsername: 'alice',
        callId: 'call-1',
      });

      expect(sendSpy).toHaveBeenCalledWith(2, 1, 'alice', 'call-1');
    });

    it('should catch and log error if sending direct call notification fails', async () => {
      const error = new Error('Call notification failed');
      jest
        .spyOn(service, 'sendDirectCallNotification')
        .mockRejectedValue(error);
      const loggerSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.onDirectCallNotification({
        recipientId: 2,
        callerId: 1,
        callerUsername: 'alice',
        callId: 'call-1',
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to send direct call push notification',
        error.stack,
      );
    });
  });

  describe('sendMentionNotification', () => {
    it('should deliver notification to each recipient with mention payload', async () => {
      const deliverSpy = jest
        .spyOn(service, 'deliver')
        .mockResolvedValue(undefined);

      await service.sendMentionNotification({
        recipients: [
          { userId: 2, types: ['username'] },
          { userId: 3, types: ['username'] },
        ],
        senderId: 1,
        senderUsername: 'alice',
        roomId: 10,
        roomName: 'general',
        messageId: 'msg-1',
        messagePreview: 'Hello @bob and @charlie',
      });

      expect(deliverSpy).toHaveBeenCalledTimes(2);
      expect(deliverSpy).toHaveBeenCalledWith(2, {
        title: 'alice · #general',
        body: 'Hello @bob and @charlie',
        tag: 'mention:msg-1',
        data: {
          type: 'mention',
          roomId: 10,
          messageId: 'msg-1',
          senderId: 1,
          url: '/text-room/10?message=msg-1',
          onActionClick: {
            default: {
              operation: 'focusLastFocusedOrOpen',
              url: '/text-room/10?message=msg-1',
            },
          },
        },
      });
      expect(deliverSpy).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          title: 'alice · #general',
          tag: 'mention:msg-1',
        }),
      );
    });

    it('should continue delivering to other recipients if one fails', async () => {
      const deliverSpy = jest
        .spyOn(service, 'deliver')
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(undefined);

      await expect(
        service.sendMentionNotification({
          recipients: [
            { userId: 2, types: ['username'] },
            { userId: 3, types: ['username'] },
          ],
          senderId: 1,
          senderUsername: 'alice',
          roomId: 10,
          roomName: 'general',
          messageId: 'msg-1',
          messagePreview: 'Hello',
        }),
      ).resolves.not.toThrow();

      expect(deliverSpy).toHaveBeenCalledTimes(2);
    });

    it('should return early without deliver if recipients is empty or body is empty', async () => {
      const deliverSpy = jest
        .spyOn(service, 'deliver')
        .mockResolvedValue(undefined);

      await service.sendMentionNotification({
        recipients: [],
        senderId: 1,
        senderUsername: 'alice',
        roomId: 10,
        roomName: 'general',
        messageId: 'msg-1',
        messagePreview: 'Hello',
      });

      await service.sendMentionNotification({
        recipients: [{ userId: 2, types: ['username'] }],
        senderId: 1,
        senderUsername: 'alice',
        roomId: 10,
        roomName: 'general',
        messageId: 'msg-1',
        messagePreview: '<p></p>',
      });

      expect(deliverSpy).not.toHaveBeenCalled();
    });
  });

  describe('onMentionNotification', () => {
    it('is registered for MENTION_CREATED event', () => {
      const metadata = Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        NotificationsService.prototype.onMentionNotification,
      );
      const events = metadata.map((m: { event: string }) => m.event);
      expect(events).toContain(TextRoomsDomainEvents.MENTION_CREATED);
    });

    it('should delegate to sendMentionNotification with payload data', async () => {
      const sendSpy = jest
        .spyOn(service, 'sendMentionNotification')
        .mockResolvedValue();

      const payload = {
        recipients: [{ userId: 2, types: ['username' as const] }],
        senderId: 1,
        senderUsername: 'alice',
        roomId: 10,
        roomName: 'general',
        messageId: 'msg-1',
        messagePreview: 'Hello',
      };

      await service.onMentionNotification(payload);

      expect(sendSpy).toHaveBeenCalledWith(payload);
    });

    it('should catch and log error if sending mention notification fails', async () => {
      const error = new Error('Mention notification failed');
      jest.spyOn(service, 'sendMentionNotification').mockRejectedValue(error);
      const loggerSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();

      await service.onMentionNotification({
        recipients: [{ userId: 2, types: ['username'] }],
        senderId: 1,
        senderUsername: 'alice',
        roomId: 10,
        roomName: 'general',
        messageId: 'msg-1',
        messagePreview: 'Hello',
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to send mention push notification',
        error.stack,
      );
    });
  });

  describe('user notification settings', () => {
    it('returns default settings when user has no stored settings', async () => {
      userSettingsRepository.findOne.mockResolvedValue(null);

      const settings = await service.getUserNotificationSettings(1);

      expect(settings).toEqual({
        directMessages: true,
        directCalls: true,
        mentions: {
          username: true,
          role: true,
          everyone: true,
        },
      });
    });

    it('returns custom settings when stored in DB', async () => {
      userSettingsRepository.findOne.mockResolvedValue({
        id: 1,
        directMessages: false,
        directCalls: true,
        mentionUsername: true,
        mentionRole: false,
        mentionEveryone: false,
      } as unknown as UserNotificationSettingsEntity);

      const settings = await service.getUserNotificationSettings(1);

      expect(settings).toEqual({
        directMessages: false,
        directCalls: true,
        mentions: {
          username: true,
          role: false,
          everyone: false,
        },
      });
    });

    it('creates new settings entity via upsert when updating for the first time', async () => {
      userSettingsRepository.findOne.mockResolvedValue(null);

      const updated = await service.updateUserNotificationSettings(mockUser, {
        directMessages: false,
        mentions: {
          everyone: false,
        },
      });

      expect(em.upsert).toHaveBeenCalledWith(
        UserNotificationSettingsEntity,
        expect.objectContaining({
          directMessages: false,
          directCalls: true,
          mentionUsername: true,
          mentionRole: true,
          mentionEveryone: false,
        }),
        expect.objectContaining({
          onConflictFields: ['user'],
          onConflictAction: 'merge',
          onConflictMergeFields: expect.arrayContaining([
            'directMessages',
            'mentionEveryone',
            'updatedAt',
          ]),
        }),
      );
      expect(em.flush).toHaveBeenCalled();
      expect(updated.directMessages).toBe(false);
      expect(updated.mentions.everyone).toBe(false);
    });

    it('updates existing settings entity via upsert', async () => {
      const existing = {
        id: 1,
        directMessages: true,
        directCalls: true,
        mentionUsername: true,
        mentionRole: true,
        mentionEveryone: true,
      } as unknown as UserNotificationSettingsEntity;
      userSettingsRepository.findOne.mockResolvedValue(existing);

      const updated = await service.updateUserNotificationSettings(mockUser, {
        directCalls: false,
        mentions: {
          role: false,
        },
      });

      expect(em.upsert).toHaveBeenCalledWith(
        UserNotificationSettingsEntity,
        expect.objectContaining({
          directMessages: true,
          directCalls: false,
          mentionUsername: true,
          mentionRole: false,
          mentionEveryone: true,
        }),
        expect.objectContaining({
          onConflictFields: ['user'],
          onConflictAction: 'merge',
          onConflictMergeFields: expect.arrayContaining([
            'directCalls',
            'mentionRole',
            'updatedAt',
          ]),
        }),
      );
      expect(em.flush).toHaveBeenCalled();
      expect(updated.directCalls).toBe(false);
      expect(updated.mentions.role).toBe(false);
    });
  });

  describe('granular notification suppression', () => {
    it('suppresses direct message notification when directMessages is false', async () => {
      userSettingsRepository.findOne.mockResolvedValue({
        directMessages: false,
        directCalls: true,
        mentionUsername: true,
        mentionRole: true,
        mentionEveryone: true,
      } as unknown as UserNotificationSettingsEntity);

      const deliverSpy = jest.spyOn(service, 'deliver');

      await service.sendDirectMessageNotification(
        2,
        1,
        'alice',
        'Hello',
        'msg-1',
      );

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it('suppresses direct call notification when directCalls is false', async () => {
      userSettingsRepository.findOne.mockResolvedValue({
        directMessages: true,
        directCalls: false,
        mentionUsername: true,
        mentionRole: true,
        mentionEveryone: true,
      } as unknown as UserNotificationSettingsEntity);

      const deliverSpy = jest.spyOn(service, 'deliver');

      await service.sendDirectCallNotification(2, 1, 'alice', 'call-1');

      expect(deliverSpy).not.toHaveBeenCalled();
    });

    it('filters mention recipients based on mention types and user settings', async () => {
      userSettingsRepository.find.mockResolvedValue([
        {
          user: { id: 2 },
          directMessages: true,
          directCalls: true,
          mentionUsername: true,
          mentionRole: false,
          mentionEveryone: false,
        } as unknown as UserNotificationSettingsEntity,
        {
          user: { id: 3 },
          directMessages: true,
          directCalls: true,
          mentionUsername: false,
          mentionRole: true,
          mentionEveryone: false,
        } as unknown as UserNotificationSettingsEntity,
      ]);

      const deliverSpy = jest
        .spyOn(service, 'deliver')
        .mockResolvedValue(undefined);

      await service.sendMentionNotification({
        recipients: [
          { userId: 2, types: ['everyone'] }, // user 2 disabled everyone -> should be filtered
          { userId: 3, types: ['role'] }, // user 3 enabled role -> should be delivered
        ],
        senderId: 1,
        senderUsername: 'alice',
        roomId: 10,
        roomName: 'general',
        messageId: 'msg-1',
        messagePreview: 'Hello everyone',
      });

      expect(deliverSpy).toHaveBeenCalledTimes(1);
      expect(deliverSpy).toHaveBeenCalledWith(
        3,
        expect.objectContaining({
          tag: 'mention:msg-1',
        }),
      );
    });

    it('delivers mention notification if user matches multiple types and at least one is enabled', async () => {
      userSettingsRepository.find.mockResolvedValue([
        {
          user: { id: 2 },
          directMessages: true,
          directCalls: true,
          mentionUsername: true,
          mentionRole: false,
          mentionEveryone: false,
        } as unknown as UserNotificationSettingsEntity,
      ]);

      const deliverSpy = jest
        .spyOn(service, 'deliver')
        .mockResolvedValue(undefined);

      await service.sendMentionNotification({
        recipients: [
          { userId: 2, types: ['everyone', 'username'] }, // username is enabled
        ],
        senderId: 1,
        senderUsername: 'alice',
        roomId: 10,
        roomName: 'general',
        messageId: 'msg-1',
        messagePreview: 'Hello @everyone and @bob',
      });

      expect(deliverSpy).toHaveBeenCalledTimes(1);
      expect(deliverSpy).toHaveBeenCalledWith(
        2,
        expect.objectContaining({
          tag: 'mention:msg-1',
        }),
      );
    });
  });
});
