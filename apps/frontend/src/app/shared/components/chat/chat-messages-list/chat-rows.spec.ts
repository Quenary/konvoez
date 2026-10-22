import { describe, expect, it } from 'vitest';
import { EAttachmentKind } from '@konvoez/shared';
import { EMessageStatus, IMessageEntity } from '../chat.store';
import {
  buildChatRows,
  DIVIDER_ROW_SIZE,
  estimateChatRowSize,
  isReadTrackable,
  messageRowKey,
  SKELETON_ROW_SIZE,
} from './chat-rows';

function message(overrides: Partial<IMessageEntity> = {}): IMessageEntity {
  return {
    id: 'm1',
    content: '',
    senderId: 2,
    senderUsername: 'bob',
    roomId: 1,
    recipientId: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: null,
    isRead: false,
    attachments: [],
    clientId: null,
    status: EMessageStatus.SUCCESS,
    replyTo: null,
    reactions: [],
    mentions: { userIds: [], roleIds: [], everyone: false },
    ...overrides,
  };
}

function image(width: number | null, height: number | null) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    kind: EAttachmentKind.IMAGE,
    name: 'a.png',
    mime: 'image/png',
    size: 1,
    width,
    height,
    durationMs: null,
    url: '/a.png',
    thumbnailUrl: null,
  };
}

describe('buildChatRows', () => {
  it('places skeletons at loading edges and the divider before the first unread', () => {
    const rows = buildChatRows({
      messages: [message({ id: 'a' }), message({ id: 'b' })],
      unreadDividerMessageId: 'b',
      loadingOlder: true,
      loadingNewer: true,
    });

    expect(rows.map((row) => row.key)).toEqual([
      'skel-top',
      'msg:a',
      'divider',
      'msg:b',
      'skel-bottom',
    ]);
  });

  it('omits skeletons and the divider when not needed', () => {
    const rows = buildChatRows({
      messages: [message({ id: 'a' })],
      unreadDividerMessageId: 'missing',
      loadingOlder: false,
      loadingNewer: false,
    });

    expect(rows.map((row) => row.kind)).toEqual(['message']);
  });
});

describe('messageRowKey', () => {
  it('keeps the key of an optimistic message after the server ack', () => {
    const pending = message({ id: 'temp-1', clientId: 'temp-1' });
    const confirmed = message({ id: 'server-1', clientId: 'temp-1' });

    expect(messageRowKey(pending)).toBe(messageRowKey(confirmed));
  });

  it('falls back to the message id', () => {
    expect(messageRowKey(message({ id: 'x' }))).toBe('msg:x');
  });
});

describe('estimateChatRowSize', () => {
  it('uses fixed sizes for skeletons and the divider', () => {
    expect(
      estimateChatRowSize({ kind: 'skeleton-top', key: 'skel-top' }, 600),
    ).toBe(SKELETON_ROW_SIZE);
    expect(estimateChatRowSize({ kind: 'divider', key: 'divider' }, 600)).toBe(
      DIVIDER_ROW_SIZE,
    );
  });

  it('grows with text length up to a cap', () => {
    const row = (content: string) => {
      const m = message({ content });
      return { kind: 'message' as const, key: messageRowKey(m), message: m };
    };
    const short = estimateChatRowSize(row('<p>hi</p>'), 600);
    const long = estimateChatRowSize(row('x'.repeat(600)), 600);
    const huge = estimateChatRowSize(row('x'.repeat(60_000)), 600);

    expect(long).toBeGreaterThan(short);
    expect(huge).toBe(long);
  });

  it('reserves the media frame from attachment dimensions', () => {
    const m = message({ attachments: [image(800, 400)] });
    const size = estimateChatRowSize(
      { kind: 'message', key: messageRowKey(m), message: m },
      1000,
    );

    expect(size).toBeGreaterThan(56 + 200);
  });

  it('uses a fixed media reserve when dimensions are unknown', () => {
    const m = message({ attachments: [image(null, null)] });

    expect(
      estimateChatRowSize(
        { kind: 'message', key: messageRowKey(m), message: m },
        1000,
      ),
    ).toBe(56 + 240);
  });
});

describe('isReadTrackable', () => {
  it('tracks unread incoming messages only', () => {
    expect(isReadTrackable(message(), 1)).toBe(true);
    expect(isReadTrackable(message({ senderId: 1 }), 1)).toBe(false);
    expect(isReadTrackable(message({ isRead: true }), 1)).toBe(false);
    expect(isReadTrackable(message({ isPendingCreate: true }), 1)).toBe(false);
  });
});
