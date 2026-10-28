import { describe, expect, it } from 'vitest';
import {
  DEFAULT_USER_NOTIFICATION_SETTINGS,
  notificationDismissPayloadSchema,
  pushNotificationActionClickSchema,
  pushNotificationDataSchema,
  pushNotificationPayloadSchema,
  updateUserNotificationSettingsSchema,
  userNotificationSettingsSchema,
} from './notification.schemas';
import {
  desktopNotificationDismissSchema,
  desktopNotificationSchema,
} from '../desktop';

describe('Notification Schemas', () => {
  describe('pushNotificationActionClickSchema', () => {
    it('accepts valid operations with or without url', () => {
      const validOperations = [
        'openWindow',
        'focusLastFocusedOrOpen',
        'navigateLastFocusedOrOpen',
        'sendRequest',
      ] as const;

      for (const operation of validOperations) {
        const parsed = pushNotificationActionClickSchema.safeParse({
          operation,
          url: '/direct/123',
        });
        expect(parsed.success).toBe(true);
      }

      const parsedNoUrl = pushNotificationActionClickSchema.safeParse({
        operation: 'focusLastFocusedOrOpen',
      });
      expect(parsedNoUrl.success).toBe(true);
    });

    it('rejects invalid operation', () => {
      const parsed = pushNotificationActionClickSchema.safeParse({
        operation: 'unknownOperation',
        url: '/direct/123',
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('pushNotificationDataSchema', () => {
    it('validates direct message data with url and onActionClick', () => {
      const validData = {
        type: 'direct-message',
        messageId: 'msg-abc-123',
        recipientId: 2,
        senderId: 1,
        url: '/direct/1',
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen' as const,
            url: '/direct/1',
          },
        },
      };

      const parsed = pushNotificationDataSchema.safeParse(validData);
      expect(parsed.success).toBe(true);
      if (!parsed.success) {
        return;
      }
      expect(parsed.data.url).toBe('/direct/1');
      expect(parsed.data.senderId).toBe(1);
      expect(parsed.data.onActionClick?.['default']?.operation).toBe(
        'focusLastFocusedOrOpen',
      );
    });

    it('validates direct call data with url and onActionClick', () => {
      const validData = {
        type: 'direct-call',
        callId: 'call-xyz-456',
        callerId: 1,
        recipientId: 2,
        url: '/direct/1',
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen' as const,
            url: '/direct/1',
          },
        },
      };

      const parsed = pushNotificationDataSchema.safeParse(validData);
      expect(parsed.success).toBe(true);
    });
  });

  describe('pushNotificationPayloadSchema and desktopNotificationSchema', () => {
    it('validates a complete push notification payload', () => {
      const payload = {
        title: 'Alice',
        body: 'Hello, how are you?',
        tag: 'direct:1',
        data: {
          type: 'direct-message',
          messageId: 'msg-1',
          senderId: 1,
          recipientId: 2,
          url: '/direct/1',
          onActionClick: {
            default: {
              operation: 'focusLastFocusedOrOpen' as const,
              url: '/direct/1',
            },
          },
        },
      };

      const parsedPush = pushNotificationPayloadSchema.safeParse(payload);
      expect(parsedPush.success).toBe(true);

      const parsedDesktop = desktopNotificationSchema.safeParse(payload);
      expect(parsedDesktop.success).toBe(true);
    });

    it('rejects empty title or body exceeding pushNotificationBodyMaxLength', () => {
      expect(
        pushNotificationPayloadSchema.safeParse({
          title: '',
          body: 'Hello',
        }).success,
      ).toBe(false);

      expect(
        pushNotificationPayloadSchema.safeParse({
          title: 'Alice',
          body: 'a'.repeat(201),
        }).success,
      ).toBe(false);
    });
  });

  describe('userNotificationSettingsSchema', () => {
    it('validates default user notification settings', () => {
      const parsed = userNotificationSettingsSchema.safeParse(
        DEFAULT_USER_NOTIFICATION_SETTINGS,
      );
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.directMessages).toBe(true);
        expect(parsed.data.directCalls).toBe(true);
        expect(parsed.data.replies).toBe(true);
        expect(parsed.data.reactions).toBe(true);
        expect(parsed.data.mentions.username).toBe(true);
        expect(parsed.data.mentions.role).toBe(true);
        expect(parsed.data.mentions.everyone).toBe(true);
      }
    });

    it('rejects missing or non-boolean values', () => {
      expect(
        userNotificationSettingsSchema.safeParse({
          directMessages: true,
          directCalls: true,
          replies: true,
          reactions: true,
        }).success,
      ).toBe(false);

      expect(
        userNotificationSettingsSchema.safeParse({
          directMessages: 'yes',
          directCalls: true,
          replies: true,
          reactions: true,
          mentions: { username: true, role: true, everyone: true },
        }).success,
      ).toBe(false);
    });
  });

  describe('updateUserNotificationSettingsSchema', () => {
    it('validates partial updates', () => {
      const validPartial = {
        directMessages: false,
        replies: false,
        reactions: false,
        mentions: {
          everyone: false,
        },
      };
      const parsed =
        updateUserNotificationSettingsSchema.safeParse(validPartial);
      expect(parsed.success).toBe(true);
    });

    it('accepts empty object for no-op update', () => {
      const parsed = updateUserNotificationSettingsSchema.safeParse({});
      expect(parsed.success).toBe(true);
    });
  });

  describe('notificationDismissPayloadSchema', () => {
    it('validates dismissal payload with required tag and optional fields', () => {
      const valid = {
        tag: 'msg_abc123',
        topic: 'msg_abc123',
        messageId: '01a16622-fe1e-74f9-b1a1-9d4158058f0c',
      };
      expect(notificationDismissPayloadSchema.safeParse(valid).success).toBe(
        true,
      );

      const minimal = { tag: 'msg_abc123' };
      expect(notificationDismissPayloadSchema.safeParse(minimal).success).toBe(
        true,
      );

      const invalidNoTag = { messageId: '01a16622' };
      expect(
        notificationDismissPayloadSchema.safeParse(invalidNoTag).success,
      ).toBe(false);
    });
  });

  describe('desktopNotificationDismissSchema', () => {
    it('accepts tag, messageId, or both', () => {
      expect(
        desktopNotificationDismissSchema.safeParse({ tag: 'msg_1' }).success,
      ).toBe(true);
      expect(
        desktopNotificationDismissSchema.safeParse({ messageId: 'm-1' })
          .success,
      ).toBe(true);
      expect(
        desktopNotificationDismissSchema.safeParse({
          tag: 'msg_1',
          messageId: 'm-1',
        }).success,
      ).toBe(true);
    });

    it('rejects empty object without tag or messageId', () => {
      expect(desktopNotificationDismissSchema.safeParse({}).success).toBe(
        false,
      );
    });

    it('rejects invalid types', () => {
      expect(
        desktopNotificationDismissSchema.safeParse({ tag: 123 }).success,
      ).toBe(false);
      expect(
        desktopNotificationDismissSchema.safeParse({ messageId: {} }).success,
      ).toBe(false);
    });
  });
});
