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
import { NotificationsDomainEvents } from './notifications.events';
import { GetUserDto } from '../users/users.dto';
import { PushSubscriptionEntity } from './notifications.entity';
import { NotificationsService } from './notifications.service';
import { VapidKeyStorageService } from './vapid-key-storage.service';
import { AppService } from '../../shared/services/app.service';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let subscriptionRepository: jest.Mocked<
    EntityRepository<PushSubscriptionEntity>
  >;
  let vapidKeyStorageService: jest.Mocked<
    Pick<
      VapidKeyStorageService,
      'readVapidKeysFromDisk' | 'saveVapidKeysToDisk'
    >
  >;
  let em: jest.Mocked<EntityManager>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockUser: GetUserDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    email: 'test@example.com',
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
    } as unknown as jest.Mocked<EntityManager>;

    subscriptionRepository = {
      getEntityManager: jest.fn().mockReturnValue(em),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
    } as unknown as jest.Mocked<EntityRepository<PushSubscriptionEntity>>;

    em.fork.mockReturnValue(em);
    em.getRepository.mockReturnValue(
      subscriptionRepository as unknown as EntityRepository<object>,
    );

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
      { VAPID_EMAIL: 'konvoez@invalid.email' } as AppService,
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
});
