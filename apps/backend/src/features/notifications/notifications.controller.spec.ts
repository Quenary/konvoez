import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import type { GetUserSafeDto } from '../users/users.dto';
import { DEFAULT_USER_NOTIFICATION_SETTINGS, EUserRole } from '@konvoez/shared';

describe('NotificationsController', () => {
  let controller: NotificationsController;
  let notificationsService: jest.Mocked<
    Pick<
      NotificationsService,
      | 'getPublicKeyIfEnabled'
      | 'getUserNotificationSettings'
      | 'updateUserNotificationSettings'
      | 'saveSubscription'
      | 'removeSubscription'
    >
  >;

  const mockAuthor: GetUserSafeDto = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Smith',
    role: EUserRole.MEMBER,
    isOwner: false,
    roles: [],
    permissions: [],
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    notificationsService = {
      getPublicKeyIfEnabled: jest
        .fn()
        .mockResolvedValue('vapid-public-key-123'),
      getUserNotificationSettings: jest
        .fn()
        .mockResolvedValue(DEFAULT_USER_NOTIFICATION_SETTINGS),
      updateUserNotificationSettings: jest
        .fn()
        .mockResolvedValue(DEFAULT_USER_NOTIFICATION_SETTINGS),
      saveSubscription: jest.fn().mockResolvedValue(undefined),
      removeSubscription: jest.fn().mockResolvedValue(undefined),
    };

    controller = new NotificationsController(
      notificationsService as unknown as NotificationsService,
    );
  });

  describe('getVapidPublicKey', () => {
    it('returns the VAPID public key', async () => {
      const result = await controller.getVapidPublicKey();
      expect(result).toEqual({ publicKey: 'vapid-public-key-123' });
      expect(notificationsService.getPublicKeyIfEnabled).toHaveBeenCalled();
    });
  });

  describe('getSettings', () => {
    it('returns user notification settings for the authenticated user', async () => {
      const result = await controller.getSettings(mockAuthor);
      expect(result).toEqual(DEFAULT_USER_NOTIFICATION_SETTINGS);
      expect(
        notificationsService.getUserNotificationSettings,
      ).toHaveBeenCalledWith(mockAuthor.id);
    });
  });

  describe('updateSettings', () => {
    it('updates and returns user notification settings', async () => {
      const dto = {
        directMessages: false,
        mentions: { everyone: false },
      };
      const expected = {
        ...DEFAULT_USER_NOTIFICATION_SETTINGS,
        directMessages: false,
        mentions: {
          ...DEFAULT_USER_NOTIFICATION_SETTINGS.mentions,
          everyone: false,
        },
      };
      notificationsService.updateUserNotificationSettings.mockResolvedValue(
        expected,
      );

      const result = await controller.updateSettings(mockAuthor, dto);
      expect(result).toEqual(expected);
      expect(
        notificationsService.updateUserNotificationSettings,
      ).toHaveBeenCalledWith(mockAuthor, dto);
    });
  });

  describe('upsertSubscription', () => {
    it('calls saveSubscription with author and dto', async () => {
      const dto = {
        endpoint: 'https://push.example.com/sub/1',
        keys: { auth: 'auth', p256dh: 'p256' },
      };
      await controller.upsertSubscription(mockAuthor, dto);
      expect(notificationsService.saveSubscription).toHaveBeenCalledWith(
        mockAuthor,
        dto,
      );
    });
  });

  describe('unsubscribe', () => {
    it('calls removeSubscription with author and endpoint', async () => {
      await controller.unsubscribe(mockAuthor, {
        endpoint: 'https://push.example.com/sub/1',
      });
      expect(notificationsService.removeSubscription).toHaveBeenCalledWith(
        mockAuthor,
        'https://push.example.com/sub/1',
      );
    });
  });
});
