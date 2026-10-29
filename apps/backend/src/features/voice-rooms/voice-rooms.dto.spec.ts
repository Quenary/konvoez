import { EVoiceSessionType } from '@konvoez/shared';
import {
  CallAcceptDto,
  CallGetActiveDto,
  CallHangupDto,
  CallInitiateDto,
  CallRejectDto,
  VoiceRoomCloseConsumerDto,
  VoiceRoomConsumerRefDto,
  VoiceRoomCloseProducerDto,
  VoiceRoomConnectTransportDto,
  VoiceRoomConsumeDto,
  VoiceRoomCreateTransportDto,
  VoiceRoomJoinDto,
  VoiceRoomProduceDto,
  VoiceRoomSetConsumerLayersDto,
  VoiceRoomSetMuteStateDto,
} from './voice-rooms.dto';

describe('VoiceRooms DTOs', () => {
  describe('VoiceRoomJoinDto', () => {
    it('should validate valid room join payload with numeric roomId', () => {
      const parsed = VoiceRoomJoinDto.schema.safeParse({ roomId: 10 });
      expect(parsed.success).toBe(true);
    });

    it('should validate valid direct call join payload with sessionKey', () => {
      const parsed = VoiceRoomJoinDto.schema.safeParse({
        sessionKey: 'call:call-123',
      });
      expect(parsed.success).toBe(true);
    });

    it('should validate valid join with discriminated sessionTarget', () => {
      const groupParsed = VoiceRoomJoinDto.schema.safeParse({
        sessionTarget: {
          type: EVoiceSessionType.GROUP_ROOM,
          roomId: 5,
        },
      });
      expect(groupParsed.success).toBe(true);

      const directParsed = VoiceRoomJoinDto.schema.safeParse({
        sessionTarget: {
          type: EVoiceSessionType.DIRECT_CALL,
          callId: 'call-1',
          interlocutorId: 2,
        },
      });
      expect(directParsed.success).toBe(true);
    });

    it('should reject invalid roomId format or negative numbers', () => {
      expect(VoiceRoomJoinDto.schema.safeParse({ roomId: -5 }).success).toBe(
        false,
      );
      expect(
        VoiceRoomJoinDto.schema.safeParse({ roomId: 'invalid' }).success,
      ).toBe(false);
    });
  });

  describe('VoiceRoomCreateTransportDto', () => {
    it('should validate valid direction', () => {
      expect(
        VoiceRoomCreateTransportDto.schema.safeParse({
          direction: 'send',
        }).success,
      ).toBe(true);

      expect(
        VoiceRoomCreateTransportDto.schema.safeParse({
          direction: 'recv',
        }).success,
      ).toBe(true);
    });

    it('should reject invalid direction', () => {
      expect(
        VoiceRoomCreateTransportDto.schema.safeParse({
          direction: 'invalid',
        }).success,
      ).toBe(false);
    });
  });

  describe('VoiceRoomConnectTransportDto', () => {
    it('should validate transportId and dtlsParameters', () => {
      expect(
        VoiceRoomConnectTransportDto.schema.safeParse({
          transportId: 'transport-1',
          dtlsParameters: {
            fingerprints: [{ algorithm: 'sha-256', value: 'aa:bb' }],
            role: 'client',
          },
        }).success,
      ).toBe(true);
    });

    it('should reject empty transportId', () => {
      expect(
        VoiceRoomConnectTransportDto.schema.safeParse({
          transportId: '',
          dtlsParameters: {},
        }).success,
      ).toBe(false);
    });
  });

  describe('VoiceRoomConsumerRefDto', () => {
    it('requires a consumer id', () => {
      expect(
        VoiceRoomConsumerRefDto.schema.safeParse({ consumerId: 'c1' }).success,
      ).toBe(true);
      expect(VoiceRoomConsumerRefDto.schema.safeParse({}).success).toBe(false);
    });
  });

  describe('VoiceRoomSetConsumerLayersDto', () => {
    it('accepts a spatial layer and rejects one outside 0..2', () => {
      expect(
        VoiceRoomSetConsumerLayersDto.schema.safeParse({
          consumerId: 'c1',
          spatialLayer: 2,
        }).success,
      ).toBe(true);
      expect(
        VoiceRoomSetConsumerLayersDto.schema.safeParse({
          consumerId: 'c1',
          spatialLayer: 3,
        }).success,
      ).toBe(false);
    });
  });

  describe('VoiceRoomProduceDto', () => {
    it('should validate transportId, kind, mediaTag, and rtpParameters', () => {
      expect(
        VoiceRoomProduceDto.schema.safeParse({
          transportId: 'trans-1',
          kind: 'audio',
          mediaTag: 'mic',
          rtpParameters: { codecs: [] },
        }).success,
      ).toBe(true);

      expect(
        VoiceRoomProduceDto.schema.safeParse({
          transportId: 'trans-2',
          kind: 'video',
          mediaTag: 'cam',
          rtpParameters: { codecs: [] },
          layers: [
            { height: 480, fps: 30 },
            { height: 720, fps: 30 },
          ],
        }).success,
      ).toBe(true);
      expect(
        VoiceRoomProduceDto.schema.safeParse({
          transportId: 'trans-2',
          kind: 'video',
          mediaTag: 'cam',
          rtpParameters: { codecs: [] },
          layers: [{ height: 0, fps: 30 }],
        }).success,
      ).toBe(false);
    });

    it('should reject invalid kind or mediaTag', () => {
      expect(
        VoiceRoomProduceDto.schema.safeParse({
          transportId: 'trans-1',
          kind: 'text',
          mediaTag: 'mic',
          rtpParameters: {},
        }).success,
      ).toBe(false);

      expect(
        VoiceRoomProduceDto.schema.safeParse({
          transportId: 'trans-1',
          kind: 'audio',
          mediaTag: 'unknown',
          rtpParameters: {},
        }).success,
      ).toBe(false);
    });
  });

  describe('VoiceRoomCloseProducerDto & VoiceRoomCloseConsumerDto', () => {
    it('should validate producerId and consumerId', () => {
      expect(
        VoiceRoomCloseProducerDto.schema.safeParse({ producerId: 'p-1' })
          .success,
      ).toBe(true);
      expect(
        VoiceRoomCloseConsumerDto.schema.safeParse({ consumerId: 'c-1' })
          .success,
      ).toBe(true);
    });
  });

  describe('VoiceRoomConsumeDto', () => {
    it('should validate producerId, transportId, and rtpCapabilities', () => {
      expect(
        VoiceRoomConsumeDto.schema.safeParse({
          producerId: 'prod-123',
          transportId: 'trans-456',
          rtpCapabilities: { codecs: [] },
        }).success,
      ).toBe(true);
    });

    it('should reject missing transportId', () => {
      expect(
        VoiceRoomConsumeDto.schema.safeParse({
          producerId: 'prod-123',
          rtpCapabilities: { codecs: [] },
        }).success,
      ).toBe(false);
    });
  });

  describe('VoiceRoomSetMuteStateDto', () => {
    it('should validate muted and deafened booleans', () => {
      expect(
        VoiceRoomSetMuteStateDto.schema.safeParse({
          muted: true,
          deafened: false,
        }).success,
      ).toBe(true);
      expect(
        VoiceRoomSetMuteStateDto.schema.safeParse({
          muted: false,
          deafened: true,
        }).success,
      ).toBe(true);
      expect(VoiceRoomSetMuteStateDto.schema.safeParse({}).success).toBe(false);
    });
  });

  describe('Direct Call DTOs', () => {
    it('CallInitiateDto should validate positive recipientId', () => {
      expect(CallInitiateDto.schema.safeParse({ recipientId: 5 }).success).toBe(
        true,
      );
      expect(CallInitiateDto.schema.safeParse({ recipientId: 0 }).success).toBe(
        false,
      );
    });

    it('CallAcceptDto & CallRejectDto should validate callId and callerId', () => {
      expect(
        CallAcceptDto.schema.safeParse({ callId: 'call-1', callerId: 2 })
          .success,
      ).toBe(true);
      expect(
        CallRejectDto.schema.safeParse({
          callId: 'call-1',
          callerId: 2,
          reason: 'declined',
        }).success,
      ).toBe(true);
      expect(
        CallAcceptDto.schema.safeParse({ callId: '', callerId: 2 }).success,
      ).toBe(false);
    });

    it('CallHangupDto & CallGetActiveDto should validate callId / interlocutorId', () => {
      expect(
        CallHangupDto.schema.safeParse({ callId: 'call-1', byUserId: 3 })
          .success,
      ).toBe(true);
      expect(
        CallGetActiveDto.schema.safeParse({ interlocutorId: 3 }).success,
      ).toBe(true);
      expect(CallGetActiveDto.schema.safeParse({}).success).toBe(true);
      expect(CallGetActiveDto.schema.safeParse(undefined).success).toBe(true);
      expect(CallGetActiveDto.create(undefined)).toEqual({});
    });
  });
});
