import { describe, expect, it } from 'vitest';
import { EUserRole } from '../enums';
import {
  voiceRoomCloseConsumerSchema,
  voiceRoomCloseProducerSchema,
  voiceRoomConsumerRefSchema,
  voiceRoomConsumeResultSchema,
  voiceRoomConnectTransportSchema,
  voiceRoomConsumeSchema,
  voiceRoomCreateTransportSchema,
  voiceRoomGetAllPeersSnapshotSchema,
  voiceRoomJoinSchema,
  voiceRoomLobbyPeerJoinedSchema,
  voiceRoomLobbyPeerLeftSchema,
  voiceRoomLobbyPeerMutedSchema,
  voiceRoomMediaTagSchema,
  voiceRoomPeerJoinedSchema,
  voiceRoomPeerLeftSchema,
  voiceRoomPeerMutedSchema,
  voiceRoomProducerScoreSchema,
  voiceRoomProduceSchema,
  voiceRoomSetConsumerLayersSchema,
  voiceRoomSetMuteStateSchema,
} from './voice-room.schemas';
import { EVoiceSessionType } from './voice-session.schemas';

describe('VoiceRoom Schemas', () => {
  const dummyUser = {
    id: 1,
    username: 'testuser',
    fullname: 'Test User',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    deletedAt: null,
  };

  describe('voiceRoomMediaTagSchema', () => {
    it.each(['mic', 'cam', 'screen', 'screen-audio'] as const)(
      'accepts valid media tag %s',
      (tag) => {
        expect(voiceRoomMediaTagSchema.safeParse(tag).success).toBe(true);
      },
    );

    it('rejects invalid media tag', () => {
      expect(voiceRoomMediaTagSchema.safeParse('invalid').success).toBe(false);
    });
  });

  describe('voiceRoomJoinSchema', () => {
    it('accepts room join with roomId', () => {
      const parsed = voiceRoomJoinSchema.safeParse({
        roomId: 123,
        muted: true,
        deafened: false,
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts room join with sessionTarget', () => {
      const parsed = voiceRoomJoinSchema.safeParse({
        sessionTarget: {
          type: EVoiceSessionType.GROUP_ROOM,
          roomId: 42,
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts direct call sessionTarget', () => {
      const parsed = voiceRoomJoinSchema.safeParse({
        sessionTarget: {
          type: EVoiceSessionType.DIRECT_CALL,
          callId: 'call-xyz',
          interlocutorId: 99,
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts sessionKey', () => {
      const parsed = voiceRoomJoinSchema.safeParse({
        sessionKey: 'room:123',
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects negative roomId', () => {
      expect(voiceRoomJoinSchema.safeParse({ roomId: -1 }).success).toBe(false);
    });
  });

  describe('voiceRoomPeerJoinedSchema', () => {
    it('accepts valid payload', () => {
      const parsed = voiceRoomPeerJoinedSchema.safeParse({
        user: dummyUser,
        sessionKey: 'room:1',
        roomId: 1,
        muted: false,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects payload missing user', () => {
      expect(
        voiceRoomPeerJoinedSchema.safeParse({ sessionKey: 'room:1' }).success,
      ).toBe(false);
    });
  });

  describe('voiceRoomPeerLeftSchema', () => {
    it('accepts valid payload', () => {
      const parsed = voiceRoomPeerLeftSchema.safeParse({
        user: dummyUser,
        sessionKey: 'room:1',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('voiceRoomSetMuteStateSchema', () => {
    it('accepts valid mute state', () => {
      const parsed = voiceRoomSetMuteStateSchema.safeParse({
        muted: true,
        deafened: true,
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects missing mute fields', () => {
      expect(
        voiceRoomSetMuteStateSchema.safeParse({ muted: true }).success,
      ).toBe(false);
    });
  });

  describe('voiceRoomPeerMutedSchema', () => {
    it('accepts valid peer muted payload', () => {
      const parsed = voiceRoomPeerMutedSchema.safeParse({
        userId: 1,
        muted: true,
        deafened: false,
        sessionKey: 'room:1',
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('voiceRoomCreateTransportSchema', () => {
    it('accepts send and recv direction', () => {
      expect(
        voiceRoomCreateTransportSchema.safeParse({ direction: 'send' }).success,
      ).toBe(true);
      expect(
        voiceRoomCreateTransportSchema.safeParse({ direction: 'recv' }).success,
      ).toBe(true);
    });

    it('rejects invalid direction', () => {
      expect(
        voiceRoomCreateTransportSchema.safeParse({ direction: 'both' }).success,
      ).toBe(false);
    });
  });

  describe('voiceRoomConnectTransportSchema', () => {
    it('accepts valid transportId and dtlsParameters', () => {
      const parsed = voiceRoomConnectTransportSchema.safeParse({
        transportId: 'trans-1',
        dtlsParameters: { role: 'client' },
      });
      expect(parsed.success).toBe(true);
    });

    it('rejects empty transportId', () => {
      expect(
        voiceRoomConnectTransportSchema.safeParse({
          transportId: '',
          dtlsParameters: {},
        }).success,
      ).toBe(false);
    });
  });

  describe('voiceRoomProduceSchema', () => {
    it('accepts valid produce parameters', () => {
      const parsed = voiceRoomProduceSchema.safeParse({
        transportId: 'trans-1',
        kind: 'audio',
        mediaTag: 'mic',
        rtpParameters: {},
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts an optional positive sourceHeight', () => {
      expect(
        voiceRoomProduceSchema.safeParse({
          transportId: 'trans-1',
          kind: 'video',
          mediaTag: 'cam',
          rtpParameters: {},
          sourceHeight: 720,
        }).success,
      ).toBe(true);
      expect(
        voiceRoomConsumeResultSchema.safeParse({
          id: 'c-1',
          producerId: 'p-1',
          kind: 'video',
          mediaTag: 'cam',
          rtpParameters: {},
          sourceHeight: 1080,
        }).success,
      ).toBe(true);
    });

    it('rejects a non-positive sourceHeight', () => {
      expect(
        voiceRoomProduceSchema.safeParse({
          transportId: 'trans-1',
          kind: 'video',
          mediaTag: 'screen',
          rtpParameters: {},
          sourceHeight: 0,
        }).success,
      ).toBe(false);
    });

    it('rejects invalid kind', () => {
      expect(
        voiceRoomProduceSchema.safeParse({
          transportId: 'trans-1',
          kind: 'data',
          mediaTag: 'mic',
          rtpParameters: {},
        }).success,
      ).toBe(false);
    });
  });

  describe('voiceRoomCloseProducerSchema & voiceRoomCloseConsumerSchema', () => {
    it('accepts close producer', () => {
      expect(
        voiceRoomCloseProducerSchema.safeParse({ producerId: 'p-1' }).success,
      ).toBe(true);
      expect(
        voiceRoomCloseProducerSchema.safeParse({ producerId: '' }).success,
      ).toBe(false);
    });

    it('accepts close consumer', () => {
      expect(
        voiceRoomCloseConsumerSchema.safeParse({ consumerId: 'c-1' }).success,
      ).toBe(true);
      expect(
        voiceRoomCloseConsumerSchema.safeParse({ consumerId: '' }).success,
      ).toBe(false);
    });

    it('accepts a consumer ref for pause and resume', () => {
      expect(
        voiceRoomConsumerRefSchema.safeParse({ consumerId: 'c-1' }).success,
      ).toBe(true);
      expect(
        voiceRoomConsumerRefSchema.safeParse({ consumerId: '' }).success,
      ).toBe(false);
    });
  });

  describe('voiceRoomSetConsumerLayersSchema', () => {
    it.each([0, 1, 2])('accepts spatial layer %i', (spatialLayer) => {
      expect(
        voiceRoomSetConsumerLayersSchema.safeParse({
          consumerId: 'c-1',
          spatialLayer,
        }).success,
      ).toBe(true);
    });

    it('rejects a spatial layer outside 0..2', () => {
      expect(
        voiceRoomSetConsumerLayersSchema.safeParse({
          consumerId: 'c-1',
          spatialLayer: 3,
        }).success,
      ).toBe(false);
    });
  });

  describe('voiceRoomConsumeSchema', () => {
    it('accepts valid consume parameters', () => {
      const parsed = voiceRoomConsumeSchema.safeParse({
        producerId: 'p-1',
        transportId: 't-1',
        rtpCapabilities: {},
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('voiceRoomGetAllPeersSnapshotSchema', () => {
    it('accepts valid snapshot', () => {
      const parsed = voiceRoomGetAllPeersSnapshotSchema.safeParse({
        epoch: 'epoch-1',
        revision: 0,
        rooms: {
          1: {
            2: {
              ...dummyUser,
              id: 2,
              muted: false,
              deafened: false,
            },
          },
        },
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('lobby event schemas', () => {
    it('validates voiceRoomLobbyPeerJoinedSchema', () => {
      const parsed = voiceRoomLobbyPeerJoinedSchema.safeParse({
        roomId: 1,
        user: dummyUser,
        epoch: 'epoch-1',
        revision: 1,
      });
      expect(parsed.success).toBe(true);
    });

    it('validates voiceRoomLobbyPeerLeftSchema', () => {
      const parsed = voiceRoomLobbyPeerLeftSchema.safeParse({
        roomId: 1,
        userId: 2,
        epoch: 'epoch-1',
        revision: 2,
      });
      expect(parsed.success).toBe(true);
    });

    it('validates voiceRoomLobbyPeerMutedSchema', () => {
      const parsed = voiceRoomLobbyPeerMutedSchema.safeParse({
        roomId: 1,
        userId: 2,
        muted: true,
        deafened: false,
        epoch: 'epoch-1',
        revision: 3,
      });
      expect(parsed.success).toBe(true);
    });
  });

  describe('voiceRoomProducerScoreSchema', () => {
    it.each([0, 5, 10])('accepts valid score %d', (score) => {
      const parsed = voiceRoomProducerScoreSchema.safeParse({
        producerId: 'prod-123',
        score,
      });
      expect(parsed.success).toBe(true);
    });

    it.each([-1, 11, 5.5, '10'])('rejects invalid score %s', (score) => {
      const parsed = voiceRoomProducerScoreSchema.safeParse({
        producerId: 'prod-123',
        score,
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects empty producerId', () => {
      const parsed = voiceRoomProducerScoreSchema.safeParse({
        producerId: '',
        score: 10,
      });
      expect(parsed.success).toBe(false);
    });
  });
});
