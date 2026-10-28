import { describe, expect, it } from 'vitest';
import { resolveNotificationUrl } from './resolve-notification-url';

describe('resolveNotificationUrl', () => {
  it('returns null when data is undefined or null', () => {
    expect(resolveNotificationUrl()).toBeNull();
    expect(resolveNotificationUrl(null)).toBeNull();
  });

  it('prefers data.url when provided as a valid relative path', () => {
    const url = resolveNotificationUrl({
      url: '/direct/42',
      senderId: 99,
      onActionClick: {
        default: {
          operation: 'focusLastFocusedOrOpen',
          url: '/direct/99',
        },
      },
    });
    expect(url).toBe('/direct/42');
  });

  it('falls back to onActionClick.default.url when data.url is absent', () => {
    const url = resolveNotificationUrl({
      onActionClick: {
        default: {
          operation: 'focusLastFocusedOrOpen',
          url: '/direct/15',
        },
      },
    });
    expect(url).toBe('/direct/15');
  });

  it('falls back to senderId when urls are absent', () => {
    const url = resolveNotificationUrl({
      senderId: 7,
      type: 'direct-message',
    });
    expect(url).toBe('/direct/7');
  });

  it('falls back to callerId for calls when urls are absent', () => {
    const url = resolveNotificationUrl({
      callerId: 19,
      type: 'direct-call',
    });
    expect(url).toBe('/direct/19');
  });

  it('falls back to roomId for rooms when urls are absent', () => {
    const url = resolveNotificationUrl({
      roomId: 3,
    });
    expect(url).toBe('/text-room/3');
  });

  it('falls back to mention room and message url when type is mention, reply or reaction', () => {
    const url = resolveNotificationUrl({
      type: 'mention',
      roomId: 10,
      messageId: '00000000-0000-7000-8000-000000000001',
    });
    expect(url).toBe(
      '/text-room/10?message=00000000-0000-7000-8000-000000000001',
    );

    const replyUrl = resolveNotificationUrl({
      type: 'reply',
      roomId: 10,
      messageId: '00000000-0000-7000-8000-000000000001',
    });
    expect(replyUrl).toBe(
      '/text-room/10?message=00000000-0000-7000-8000-000000000001',
    );

    const reactionUrl = resolveNotificationUrl({
      type: 'reaction',
      roomId: 10,
      messageId: '00000000-0000-7000-8000-000000000001',
    });
    expect(reactionUrl).toBe(
      '/text-room/10?message=00000000-0000-7000-8000-000000000001',
    );

    const urlWithoutMsg = resolveNotificationUrl({
      type: 'mention',
      roomId: 10,
    });
    expect(urlWithoutMsg).toBe('/text-room/10');
  });

  it('falls back to recipientId for direct-message if senderId is absent', () => {
    const url = resolveNotificationUrl({
      recipientId: 5,
      type: 'direct-message',
    });
    expect(url).toBe('/direct/5');
  });

  it('rejects external URLs (absolute HTTP/HTTPS)', () => {
    expect(
      resolveNotificationUrl({
        url: 'https://evil.com/phishing',
      }),
    ).toBeNull();

    expect(
      resolveNotificationUrl({
        url: 'http://evil.com/phishing',
      }),
    ).toBeNull();
  });

  it('rejects protocol-relative URLs', () => {
    expect(
      resolveNotificationUrl({
        url: '//evil.com/phishing',
      }),
    ).toBeNull();
  });

  it('rejects javascript: and other dangerous pseudo-protocols', () => {
    expect(
      resolveNotificationUrl({
        url: 'javascript:alert(1)',
      }),
    ).toBeNull();

    expect(
      resolveNotificationUrl({
        url: 'data:text/html,evil',
      }),
    ).toBeNull();
  });

  it('rejects backslash paths', () => {
    expect(
      resolveNotificationUrl({
        url: '/\\evil.com',
      }),
    ).toBeNull();
  });

  it('resolves specific action url when action matches onActionClick', () => {
    const url = resolveNotificationUrl(
      {
        url: '/direct/1',
        onActionClick: {
          default: {
            operation: 'focusLastFocusedOrOpen',
            url: '/direct/1',
          },
          call: {
            operation: 'focusLastFocusedOrOpen',
            url: '/direct/1?call=incoming',
          },
        },
      },
      'call',
    );
    expect(url).toBe('/direct/1?call=incoming');
  });

  it('rejects invalid or non-positive IDs in fallbacks', () => {
    expect(
      resolveNotificationUrl({
        senderId: -1,
      }),
    ).toBeNull();

    expect(
      resolveNotificationUrl({
        senderId: 0,
      }),
    ).toBeNull();

    expect(
      resolveNotificationUrl({
        roomId: -5,
      }),
    ).toBeNull();

    expect(
      resolveNotificationUrl({
        callerId: Number.NaN,
      }),
    ).toBeNull();
  });
});
