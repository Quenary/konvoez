import { describe, expect, it } from 'vitest';
import { EUserRole } from '../enums';
import {
  callAcceptPayloadSchema,
  callAnsweredElsewherePayloadSchema,
  callEndedPayloadSchema,
  callGetActivePayloadSchema,
  callGetActiveResultSchema,
  callHangupPayloadSchema,
  callIncomingPayloadSchema,
  callInitiatePayloadSchema,
  callInitiateResultSchema,
  callRejectPayloadSchema,
  EVoiceSessionType,
  getDirectCallIdFromSessionKey,
  getGroupRoomIdFromSessionKey,
  getVoiceSessionKey,
  isDirectCallVoiceSession,
  isGroupVoiceSession,
  parseVoiceSessionKey,
  toVoiceSessionIdentity,
  voiceSessionIdentitySchema,
  voiceSessionTargetSchema,
} from './voice-session.schemas';

describe('VoiceSession Schemas & Helpers', () => {
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

  describe('voiceSessionTargetSchema', () => {
    it('validates GROUP_ROOM target', () => {
      const parsed = voiceSessionTargetSchema.safeParse({
        type: EVoiceSessionType.GROUP_ROOM,
        roomId: 5,
      });
      expect(parsed.success).toBe(true);
    });

    it('validates DIRECT_CALL target', () => {
      const parsed = voiceSessionTargetSchema.safeParse({
        type: EVoiceSessionType.DIRECT_CALL,
        callId: 'call-123',
        interlocutorId: 42,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects invalid type or missing interlocutorId in DIRECT_CALL', () => {
      expect(
        voiceSessionTargetSchema.safeParse({
          type: EVoiceSessionType.DIRECT_CALL,
          callId: 'call-123',
        }).success,
      ).toBe(false);
    });
  });

  describe('voiceSessionIdentitySchema', () => {
    it('validates GROUP_ROOM and DIRECT_CALL identities', () => {
      expect(
        voiceSessionIdentitySchema.safeParse({
          type: EVoiceSessionType.GROUP_ROOM,
          roomId: 10,
        }).success,
      ).toBe(true);

      expect(
        voiceSessionIdentitySchema.safeParse({
          type: EVoiceSessionType.DIRECT_CALL,
          callId: 'call-abc',
        }).success,
      ).toBe(true);
    });
  });

  describe('session key helpers', () => {
    it('encodes and parses group room session key', () => {
      const target = {
        type: EVoiceSessionType.GROUP_ROOM as const,
        roomId: 42,
      };
      const key = getVoiceSessionKey(target);
      expect(key).toBe('room:42');

      const parsed = parseVoiceSessionKey(key);
      expect(parsed).toEqual({
        type: EVoiceSessionType.GROUP_ROOM,
        roomId: 42,
      });
      expect(getGroupRoomIdFromSessionKey(key)).toBe(42);
      expect(getDirectCallIdFromSessionKey(key)).toBeNull();
      if (parsed) {
        expect(isGroupVoiceSession(parsed)).toBe(true);
        expect(isDirectCallVoiceSession(parsed)).toBe(false);
      }
    });

    it('encodes and parses direct call session key', () => {
      const target = {
        type: EVoiceSessionType.DIRECT_CALL as const,
        callId: 'abc-xyz',
        interlocutorId: 99,
      };
      const key = getVoiceSessionKey(target);
      expect(key).toBe('call:abc-xyz');

      const parsed = parseVoiceSessionKey(key);
      expect(parsed).toEqual({
        type: EVoiceSessionType.DIRECT_CALL,
        callId: 'abc-xyz',
      });
      expect(getDirectCallIdFromSessionKey(key)).toBe('abc-xyz');
      expect(getGroupRoomIdFromSessionKey(key)).toBeNull();
      if (parsed) {
        expect(isDirectCallVoiceSession(parsed)).toBe(true);
        expect(isGroupVoiceSession(parsed)).toBe(false);
      }
    });

    it('toVoiceSessionIdentity strips interlocutorId for direct calls', () => {
      const target = {
        type: EVoiceSessionType.DIRECT_CALL as const,
        callId: 'c-1',
        interlocutorId: 10,
      };
      expect(toVoiceSessionIdentity(target)).toEqual({
        type: EVoiceSessionType.DIRECT_CALL,
        callId: 'c-1',
      });
    });
  });

  describe('direct call payload schemas', () => {
    it('validates callInitiatePayloadSchema', () => {
      expect(
        callInitiatePayloadSchema.safeParse({ recipientId: 2 }).success,
      ).toBe(true);
      expect(
        callInitiatePayloadSchema.safeParse({ recipientId: -1 }).success,
      ).toBe(false);
    });

    it('validates callInitiateResultSchema', () => {
      expect(
        callInitiateResultSchema.safeParse({
          callId: 'call-1',
          alreadyActive: true,
        }).success,
      ).toBe(true);
    });

    it('validates callIncomingPayloadSchema', () => {
      expect(
        callIncomingPayloadSchema.safeParse({
          callId: 'call-1',
          caller: dummyUser,
        }).success,
      ).toBe(true);
    });

    it('validates callAcceptPayloadSchema', () => {
      expect(
        callAcceptPayloadSchema.safeParse({
          callId: 'c-1',
          callerId: 10,
        }).success,
      ).toBe(true);
    });

    it('validates callRejectPayloadSchema', () => {
      expect(
        callRejectPayloadSchema.safeParse({
          callId: 'c-1',
          callerId: 10,
          reason: 'busy',
        }).success,
      ).toBe(true);
    });

    it('validates callHangupPayloadSchema', () => {
      expect(
        callHangupPayloadSchema.safeParse({
          callId: 'c-1',
          byUserId: 10,
        }).success,
      ).toBe(true);
    });

    it('validates callEndedPayloadSchema', () => {
      expect(
        callEndedPayloadSchema.safeParse({
          callId: 'c-1',
          reason: 'timeout',
        }).success,
      ).toBe(true);
    });

    it('validates callAnsweredElsewherePayloadSchema', () => {
      expect(
        callAnsweredElsewherePayloadSchema.safeParse({
          callId: 'c-1',
          outcome: 'accepted',
        }).success,
      ).toBe(true);
    });

    it('validates callGetActivePayloadSchema and result', () => {
      expect(
        callGetActivePayloadSchema.safeParse({ interlocutorId: 5 }).success,
      ).toBe(true);
      expect(callGetActivePayloadSchema.safeParse({}).success).toBe(true);
      expect(callGetActivePayloadSchema.safeParse(undefined).success).toBe(
        true,
      );
      expect(callGetActivePayloadSchema.parse(undefined)).toEqual({});

      expect(
        callGetActiveResultSchema.safeParse({
          callId: 'c-1',
          callerId: 1,
          recipientId: 2,
        }).success,
      ).toBe(true);
    });
  });
});
