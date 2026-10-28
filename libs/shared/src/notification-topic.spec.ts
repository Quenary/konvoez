import {
  buildCallNotificationTopic,
  buildMessageNotificationTopic,
  buildReactionNotificationTopic,
  encodeUuidToBase64Url,
} from './notification-topic';

describe('notification-topic', () => {
  const sampleUuid = '01a16622-fe1e-74f9-b1a1-9d4158058f0c';
  const rfc8030Regex = /^[A-Za-z0-9_-]{1,32}$/;

  describe('encodeUuidToBase64Url', () => {
    it('encodes a 36-character UUID string into exactly 22 URL-safe base64 characters', () => {
      const encoded = encodeUuidToBase64Url(sampleUuid);
      expect(encoded).toHaveLength(22);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(encoded).toBe(
        Buffer.from(sampleUuid.replace(/-/g, ''), 'hex').toString('base64url'),
      );
    });

    it('falls back safely for non-UUID strings', () => {
      expect(encodeUuidToBase64Url('invalid-id@123')).toBe('invalid-id123');
      expect(encodeUuidToBase64Url('')).toBe('id');
    });
  });

  describe('buildMessageNotificationTopic', () => {
    it('builds a topic conforming strictly to RFC 8030 (<= 32 chars, base64url)', () => {
      const topic = buildMessageNotificationTopic(sampleUuid);
      expect(topic).toBe(`msg_${encodeUuidToBase64Url(sampleUuid)}`);
      expect(topic.length).toBeLessThanOrEqual(32);
      expect(topic).toMatch(rfc8030Regex);
    });
  });

  describe('buildReactionNotificationTopic', () => {
    it('builds a reaction topic including sender id that conforms to RFC 8030', () => {
      const topic = buildReactionNotificationTopic(sampleUuid, 42);
      expect(topic).toBe(
        `rx_${encodeUuidToBase64Url(sampleUuid)}_${(42).toString(36)}`,
      );
      expect(topic.length).toBeLessThanOrEqual(32);
      expect(topic).toMatch(rfc8030Regex);
    });

    it('handles large sender IDs without exceeding 32 characters', () => {
      const topic = buildReactionNotificationTopic(sampleUuid, 10_000_000);
      expect(topic.length).toBeLessThanOrEqual(32);
      expect(topic).toMatch(rfc8030Regex);
    });
  });

  describe('buildCallNotificationTopic', () => {
    it('builds a call topic conforming strictly to RFC 8030', () => {
      const topic = buildCallNotificationTopic(sampleUuid);
      expect(topic).toBe(`call_${encodeUuidToBase64Url(sampleUuid)}`);
      expect(topic.length).toBeLessThanOrEqual(32);
      expect(topic).toMatch(rfc8030Regex);
    });
  });
});
