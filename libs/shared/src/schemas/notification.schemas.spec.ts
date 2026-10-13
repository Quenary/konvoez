import { describe, expect, it } from 'vitest';
import {
  pushNotificationActionClickSchema,
  pushNotificationDataSchema,
  pushNotificationPayloadSchema,
} from './notification.schemas';
import { desktopNotificationSchema } from '../desktop';

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
      if (parsed.success) {
        expect(parsed.data.url).toBe('/direct/1');
        expect(parsed.data.senderId).toBe(1);
        expect(parsed.data.onActionClick?.['default']?.operation).toBe(
          'focusLastFocusedOrOpen',
        );
      }
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
});
