import { describe, expect, it } from 'vitest';
import { ApiErrorCode } from '../errors';
import { EUserRole } from '../enums';
import { SCHEMA_ERROR } from './base.schemas';
import {
  messageListResponseSchema,
  messageSchema,
  messagesReadEventSchema,
  readAllSchema,
  textRoomErrorSchema,
  textRoomJoinSchema,
  textRoomMessageDeletedSchema,
  textRoomPeerSchema,
  textRoomReactionUpdatedSchema,
  textRoomUserTypingSchema,
  unreadCountsSchema,
} from './text-room.schemas';

describe('TextRoom Schemas', () => {
  const dummyUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
  };

  describe('textRoomJoinSchema', () => {
    it('accepts room join and recipient join', () => {
      expect(
        textRoomJoinSchema.safeParse({ roomId: 42, recipientId: null }).success,
      ).toBe(true);

      expect(
        textRoomJoinSchema.safeParse({ roomId: null, recipientId: 99 }).success,
      ).toBe(true);
    });

    it('rejects invalid types', () => {
      expect(
        textRoomJoinSchema.safeParse({ roomId: 'invalid', recipientId: null })
          .success,
      ).toBe(false);
    });
  });

  describe('textRoomUserTypingSchema', () => {
    it('accepts valid user typing payload', () => {
      expect(
        textRoomUserTypingSchema.safeParse({ id: 1, username: 'alice' })
          .success,
      ).toBe(true);
    });

    it('rejects missing username', () => {
      expect(textRoomUserTypingSchema.safeParse({ id: 1 }).success).toBe(false);
    });
  });

  describe('textRoomPeerSchema', () => {
    it('accepts valid peer with clientId', () => {
      const parsed = textRoomPeerSchema.safeParse({
        ...dummyUser,
        clientId: 'socket-client-123',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('textRoomMessageDeletedSchema', () => {
    it('accepts valid uuid', () => {
      expect(
        textRoomMessageDeletedSchema.safeParse({
          id: '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
        }).success,
      ).toBe(true);
    });

    it('rejects non-uuid', () => {
      expect(
        textRoomMessageDeletedSchema.safeParse({
          id: '123',
        }).success,
      ).toBe(false);
    });
  });

  describe('textRoomReactionUpdatedSchema', () => {
    it('accepts valid reaction updated payload', () => {
      const parsed = textRoomReactionUpdatedSchema.safeParse({
        messageId: '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
        roomId: 42,
        recipientId: null,
        senderId: 1,
        reactions: [
          {
            emoji: '👍',
            count: 1,
            userIds: [1],
          },
        ],
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('textRoomErrorSchema', () => {
    it('accepts error message', () => {
      expect(
        textRoomErrorSchema.safeParse({
          code: ApiErrorCode.UNAUTHORIZED,
          message: 'Unauthorized',
        }).success,
      ).toBe(true);
    });
  });

  describe('messageSchema', () => {
    it('defaults mentions to empty set when omitted', () => {
      const oldMessage = {
        id: '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
        senderId: 1,
        senderUsername: 'alice',
        recipientId: null,
        roomId: 42,
        content: 'hello',
        replyTo: null,
        isRead: false,
        attachments: [],
        clientId: null,
        reactions: [],
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };

      const parsed = messageSchema.parse(oldMessage);
      expect(parsed.mentions).toEqual({
        userIds: [],
        roleIds: [],
        everyone: false,
      });
    });

    it('accepts explicit mentions in message', () => {
      const message = {
        id: '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
        senderId: 1,
        senderUsername: 'alice',
        recipientId: null,
        roomId: 42,
        content: 'hello',
        replyTo: null,
        isRead: false,
        attachments: [],
        clientId: null,
        reactions: [],
        mentions: {
          userIds: [2, 3],
          roleIds: [5],
          everyone: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: null,
      };

      const parsed = messageSchema.parse(message);
      expect(parsed.mentions).toEqual({
        userIds: [2, 3],
        roleIds: [5],
        everyone: true,
      });
    });
  });

  describe('unreadCountsSchema', () => {
    it('defaults roomMentions to empty object when omitted', () => {
      const counts = {
        rooms: { '1': 2 },
        direct: { '2': 1 },
        directTotal: 1,
      };

      const parsed = unreadCountsSchema.parse(counts);
      expect(parsed.roomMentions).toEqual({});
    });

    it('accepts explicit roomMentions', () => {
      const counts = {
        rooms: { '1': 2 },
        roomMentions: { '1': 1 },
        direct: {},
        directTotal: 0,
      };

      const parsed = unreadCountsSchema.parse(counts);
      expect(parsed.roomMentions).toEqual({ '1': 1 });
    });
  });

  describe('messageListResponseSchema', () => {
    it('applies defaults for unread anchor fields when omitted', () => {
      const parsed = messageListResponseSchema.parse({
        items: [],
      });
      expect(parsed.firstUnreadMessageId).toBeNull();
      expect(parsed.hasMoreBefore).toBe(false);
      expect(parsed.hasMoreAfter).toBe(false);
    });

    it('accepts explicit unread anchor fields', () => {
      const parsed = messageListResponseSchema.parse({
        items: [],
        firstUnreadMessageId: '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
        hasMoreBefore: true,
        hasMoreAfter: true,
      });
      expect(parsed.firstUnreadMessageId).toBe(
        '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
      );
      expect(parsed.hasMoreBefore).toBe(true);
      expect(parsed.hasMoreAfter).toBe(true);
    });
  });

  describe('readAllSchema', () => {
    it('accepts room-only target', () => {
      const parsed = readAllSchema.safeParse({
        roomId: 42,
        recipientId: null,
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts recipient-only target', () => {
      const parsed = readAllSchema.safeParse({
        roomId: null,
        recipientId: 99,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects when both roomId and recipientId are provided', () => {
      const parsed = readAllSchema.safeParse({
        roomId: 42,
        recipientId: 99,
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toBe(
          SCHEMA_ERROR.INVALID_CHAT_TARGET,
        );
      }
    });

    it('rejects when neither roomId nor recipientId is provided', () => {
      const parsed = readAllSchema.safeParse({
        roomId: null,
        recipientId: null,
      });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toBe(
          SCHEMA_ERROR.INVALID_CHAT_TARGET,
        );
      }
    });
  });

  describe('messagesReadEventSchema', () => {
    it('applies defaults for messageIds and maxMessageId', () => {
      const parsed = messagesReadEventSchema.parse({
        readerId: 1,
        roomId: 42,
        recipientId: null,
      });
      expect(parsed.messageIds).toEqual([]);
      expect(parsed.maxMessageId).toBeNull();
    });

    it('accepts explicit messageIds and maxMessageId', () => {
      const parsed = messagesReadEventSchema.parse({
        readerId: 1,
        roomId: null,
        recipientId: 2,
        messageIds: ['018f4a1e-5a72-7752-9053-4ecdcb8bfa66'],
        maxMessageId: '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
      });
      expect(parsed.messageIds).toEqual([
        '018f4a1e-5a72-7752-9053-4ecdcb8bfa66',
      ]);
      expect(parsed.maxMessageId).toBe('018f4a1e-5a72-7752-9053-4ecdcb8bfa66');
    });
  });
});
