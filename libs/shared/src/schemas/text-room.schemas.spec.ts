import { describe, expect, it } from 'vitest';
import { ApiErrorCode } from '../errors';
import { EUserRole } from '../enums';
import {
  textRoomErrorSchema,
  textRoomJoinSchema,
  textRoomMessageDeletedSchema,
  textRoomPeerSchema,
  textRoomReactionUpdatedSchema,
  textRoomUserTypingSchema,
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
});
