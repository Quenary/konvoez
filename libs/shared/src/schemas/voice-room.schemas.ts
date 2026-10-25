import * as z from 'zod';
import { userSafeSchema } from './user.schemas';
import { EDirectCallEvent, EVoiceRoomEvent } from '../enums';
import {
  TDirectCallEventPayloadMap,
  TDirectCallEventResultMap,
  voiceSessionTargetSchema,
} from './voice-session.schemas';

export const voiceRoomMediaTagSchema = z.enum([
  'mic',
  'cam',
  'screen',
  'screen-audio',
]);
export type TVoiceRoomMediaTag = z.infer<typeof voiceRoomMediaTagSchema>;

export const voiceRoomJoinSchema = z.object({
  roomId: z.number().int().positive().optional(),
  sessionTarget: voiceSessionTargetSchema.optional(),
  sessionKey: z.string().min(1).optional(),
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
});
export type TVoiceRoomJoin = z.infer<typeof voiceRoomJoinSchema>;

export const voiceRoomPeerJoinedSchema = z.object({
  user: userSafeSchema,
  roomId: z.number().int().positive().optional(),
  sessionKey: z.string().min(1),
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
});
export type TVoiceRoomPeerJoined = z.infer<typeof voiceRoomPeerJoinedSchema>;

export const voiceRoomPeerLeftSchema = z.object({
  user: userSafeSchema,
  roomId: z.number().int().positive().optional(),
  sessionKey: z.string().min(1),
});
export type TVoiceRoomPeerLeft = z.infer<typeof voiceRoomPeerLeftSchema>;

export const voiceRoomClosedSchema = z.object({
  roomId: z.number().int().positive(),
  sessionKey: z.string().min(1),
  reason: z.literal('deleted'),
});
export type TVoiceRoomClosed = z.infer<typeof voiceRoomClosedSchema>;

export const voiceRoomPeerUserSchema = userSafeSchema.extend({
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
});
export type TVoiceRoomPeerUser = z.infer<typeof voiceRoomPeerUserSchema>;

/**
 * Map group room id to map of users currently in that voice room.
 * Direct-call sessions are intentionally excluded.
 */
export const voiceRoomGetAllPeersResultSchema = z.record(
  z.coerce.number().int(),
  z.record(z.coerce.number().int(), voiceRoomPeerUserSchema),
);
export type TVoiceRoomGetAllPeersResult = z.infer<
  typeof voiceRoomGetAllPeersResultSchema
>;

/**
 * `epoch` identifies the server process that owns `revision`;
 * the revision counter restarts from 0 whenever the epoch changes.
 */
export const voiceRoomGetAllPeersSnapshotSchema = z.object({
  epoch: z.string().min(1),
  revision: z.number().int().nonnegative(),
  rooms: voiceRoomGetAllPeersResultSchema,
});
export type TVoiceRoomGetAllPeersSnapshot = z.infer<
  typeof voiceRoomGetAllPeersSnapshotSchema
>;

export const voiceRoomLobbyPeerJoinedSchema = z.object({
  roomId: z.number().int().positive(),
  user: userSafeSchema,
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
  epoch: z.string().min(1),
  revision: z.number().int().nonnegative(),
});
export type TVoiceRoomLobbyPeerJoined = z.infer<
  typeof voiceRoomLobbyPeerJoinedSchema
>;

export const voiceRoomLobbyPeerLeftSchema = z.object({
  roomId: z.number().int().positive(),
  userId: z.number().int().positive(),
  epoch: z.string().min(1),
  revision: z.number().int().nonnegative(),
});
export type TVoiceRoomLobbyPeerLeft = z.infer<
  typeof voiceRoomLobbyPeerLeftSchema
>;

export const voiceRoomLobbyPeerMutedSchema = z.object({
  roomId: z.number().int().positive(),
  userId: z.number().int().positive(),
  muted: z.boolean(),
  deafened: z.boolean(),
  epoch: z.string().min(1),
  revision: z.number().int().nonnegative(),
});
export type TVoiceRoomLobbyPeerMuted = z.infer<
  typeof voiceRoomLobbyPeerMutedSchema
>;

export const voiceRoomProduceResultSchema = z.object({
  producerId: z.string().min(1),
  userId: z.number().int().positive(),
  kind: z.enum(['audio', 'video']),
  mediaTag: voiceRoomMediaTagSchema,
});
export type TVoiceRoomProduceResult = z.infer<
  typeof voiceRoomProduceResultSchema
>;

export const voiceRoomUserWithProducersSchema = userSafeSchema.extend({
  producers: z.array(voiceRoomProduceResultSchema),
  muted: z.boolean().optional(),
  deafened: z.boolean().optional(),
});
export type TVoiceRoomUserWithProducers = z.infer<
  typeof voiceRoomUserWithProducersSchema
>;

/**
 * Map user id to info with producers
 */
export const voiceRoomPeersOnJoinSchema = z.record(
  z.coerce.number().int(),
  voiceRoomUserWithProducersSchema,
);
export type TVoiceRoomPeersOnJoin = z.infer<typeof voiceRoomPeersOnJoinSchema>;

export const voiceRoomSetMuteStateSchema = z.object({
  muted: z.boolean(),
  deafened: z.boolean(),
});
export type TVoiceRoomSetMuteState = z.infer<
  typeof voiceRoomSetMuteStateSchema
>;

export const voiceRoomPeerMutedSchema = z.object({
  userId: z.number().int().positive(),
  muted: z.boolean(),
  deafened: z.boolean(),
  sessionKey: z.string().min(1),
  roomId: z.number().int().positive().optional(),
});
export type TVoiceRoomPeerMuted = z.infer<typeof voiceRoomPeerMutedSchema>;

export const voiceRoomCreateTransportSchema = z.object({
  direction: z.enum(['send', 'recv']),
});
export type TVoiceRoomCreateTransport = z.infer<
  typeof voiceRoomCreateTransportSchema
>;

export const voiceRoomCreateTransportResultSchema = z.object({
  id: z.string().min(1),
  /** Opaque mediasoup IceParameters JSON */
  iceParameters: z.unknown(),
  /** Opaque mediasoup IceCandidate[] JSON */
  iceCandidates: z.unknown(),
  /** Opaque mediasoup DtlsParameters JSON */
  dtlsParameters: z.unknown(),
  /** Opaque mediasoup SctpParameters JSON */
  sctpParameters: z.unknown(),
});
export type TVoiceRoomCreateTransportResult = z.infer<
  typeof voiceRoomCreateTransportResultSchema
>;

export const voiceRoomConnectTransportSchema = z.object({
  transportId: z.string().min(1),
  /** Opaque mediasoup DtlsParameters JSON */
  dtlsParameters: z.unknown(),
});
export type TVoiceRoomConnectTransport = z.infer<
  typeof voiceRoomConnectTransportSchema
>;

export const voiceRoomProduceSchema = z.object({
  transportId: z.string().min(1),
  kind: z.enum(['audio', 'video']),
  mediaTag: voiceRoomMediaTagSchema,
  /** Opaque mediasoup RtpParameters JSON */
  rtpParameters: z.unknown(),
});
export type TVoiceRoomProduce = z.infer<typeof voiceRoomProduceSchema>;

export const voiceRoomProducerClosedSchema = z.object({
  producerId: z.string().min(1),
  userId: z.number().int().positive(),
  reason: z.literal('peer-left').optional(),
});
export type TVoiceRoomProducerClosed = z.infer<
  typeof voiceRoomProducerClosedSchema
>;

export const voiceRoomCloseProducerSchema = z.object({
  producerId: z.string().min(1),
});
export type TVoiceRoomCloseProducer = z.infer<
  typeof voiceRoomCloseProducerSchema
>;

export const voiceRoomConsumeSchema = z.object({
  producerId: z.string().min(1),
  transportId: z.string().min(1),
  /** Opaque mediasoup RtpCapabilities JSON */
  rtpCapabilities: z.unknown(),
});
export type TVoiceRoomConsume = z.infer<typeof voiceRoomConsumeSchema>;

export const voiceRoomConsumeResultSchema = z.object({
  id: z.string().min(1),
  producerId: z.string().min(1),
  kind: z.enum(['audio', 'video']),
  mediaTag: voiceRoomMediaTagSchema,
  /** Opaque mediasoup RtpParameters JSON */
  rtpParameters: z.unknown(),
});
export type TVoiceRoomConsumeResult = z.infer<
  typeof voiceRoomConsumeResultSchema
>;

export const voiceRoomCloseConsumerSchema = z.object({
  consumerId: z.string().min(1),
});
export type TVoiceRoomCloseConsumer = z.infer<
  typeof voiceRoomCloseConsumerSchema
>;

export const voiceRoomConsumerClosedSchema = z.object({
  consumerId: z.string().min(1),
});
export type TVoiceRoomConsumerClosed = z.infer<
  typeof voiceRoomConsumerClosedSchema
>;

export const voiceRoomRestartIceSchema = z.object({
  transportId: z.string().min(1),
});
export type TVoiceRoomRestartIce = z.infer<typeof voiceRoomRestartIceSchema>;

export type TVoiceRoomRestartIceResult = {
  /** Opaque mediasoup IceParameters JSON */
  iceParameters: unknown;
};

export type TVoiceRoomSessionCheckResult = {
  /** True when the socket is still a peer of its voice session. */
  active: boolean;
};

export const voiceRoomErrorSchema = z.object({
  message: z.string(),
});
export type TVoiceRoomError = z.infer<typeof voiceRoomErrorSchema>;

export const voiceRoomProducerScoreSchema = z.object({
  producerId: z.string().min(1),
  score: z.number().int().min(0).max(10),
});
export type TVoiceRoomProducerScore = z.infer<
  typeof voiceRoomProducerScoreSchema
>;

export type TVoiceRoomEventPayloadMap = {
  [EVoiceRoomEvent.JOIN_ROOM]: TVoiceRoomJoin;
  [EVoiceRoomEvent.LEAVE_ROOM]: void;
  [EVoiceRoomEvent.PEER_JOINED]: TVoiceRoomPeerJoined;
  [EVoiceRoomEvent.PEER_LEFT]: TVoiceRoomPeerLeft;
  [EVoiceRoomEvent.ROOM_CLOSED]: TVoiceRoomClosed;
  [EVoiceRoomEvent.GET_ALL_PEERS]: void;
  [EVoiceRoomEvent.PEERS_ON_JOIN]: TVoiceRoomPeersOnJoin;
  [EVoiceRoomEvent.GET_RTP_CAPABILITIES]: void;
  [EVoiceRoomEvent.CREATE_TRANSPORT]: TVoiceRoomCreateTransport;
  [EVoiceRoomEvent.CONNECT_TRANSPORT]: TVoiceRoomConnectTransport;
  [EVoiceRoomEvent.PRODUCE]: TVoiceRoomProduce;
  [EVoiceRoomEvent.PRODUCER_CREATED]: TVoiceRoomProduceResult;
  [EVoiceRoomEvent.PRODUCER_CLOSED]: TVoiceRoomProducerClosed;
  [EVoiceRoomEvent.PRODUCER_SCORE]: TVoiceRoomProducerScore;
  [EVoiceRoomEvent.CLOSE_PRODUCER]: TVoiceRoomCloseProducer;
  [EVoiceRoomEvent.CONSUME]: TVoiceRoomConsume;
  [EVoiceRoomEvent.CLOSE_CONSUMER]: TVoiceRoomCloseConsumer;
  [EVoiceRoomEvent.CONSUMER_CLOSED]: TVoiceRoomConsumerClosed;
  [EVoiceRoomEvent.SET_MUTE_STATE]: TVoiceRoomSetMuteState;
  [EVoiceRoomEvent.PEER_MUTE_CHANGED]: TVoiceRoomPeerMuted;
  [EVoiceRoomEvent.SESSION_CHECK]: void;
  [EVoiceRoomEvent.RESTART_ICE]: TVoiceRoomRestartIce;
  [EVoiceRoomEvent.ERROR]: TVoiceRoomError;
} & TDirectCallEventPayloadMap;

export type TVoiceRoomEventResultMap = {
  [EVoiceRoomEvent.JOIN_ROOM]: object;
  [EVoiceRoomEvent.LEAVE_ROOM]: object;
  [EVoiceRoomEvent.PEER_JOINED]: void;
  [EVoiceRoomEvent.PEER_LEFT]: void;
  [EVoiceRoomEvent.ROOM_CLOSED]: void;
  [EVoiceRoomEvent.GET_ALL_PEERS]: TVoiceRoomGetAllPeersSnapshot;
  [EVoiceRoomEvent.PEERS_ON_JOIN]: void;
  /** Opaque mediasoup RtpCapabilities JSON */
  [EVoiceRoomEvent.GET_RTP_CAPABILITIES]: unknown;
  [EVoiceRoomEvent.CREATE_TRANSPORT]: TVoiceRoomCreateTransportResult;
  [EVoiceRoomEvent.CONNECT_TRANSPORT]: object;
  [EVoiceRoomEvent.PRODUCE]: TVoiceRoomProduceResult;
  [EVoiceRoomEvent.PRODUCER_CREATED]: void;
  [EVoiceRoomEvent.PRODUCER_CLOSED]: void;
  [EVoiceRoomEvent.PRODUCER_SCORE]: void;
  [EVoiceRoomEvent.CLOSE_PRODUCER]: object;
  [EVoiceRoomEvent.CONSUME]: TVoiceRoomConsumeResult;
  [EVoiceRoomEvent.CLOSE_CONSUMER]: object;
  [EVoiceRoomEvent.CONSUMER_CLOSED]: void;
  [EVoiceRoomEvent.SET_MUTE_STATE]: object;
  [EVoiceRoomEvent.PEER_MUTE_CHANGED]: void;
  [EVoiceRoomEvent.SESSION_CHECK]: TVoiceRoomSessionCheckResult;
  [EVoiceRoomEvent.RESTART_ICE]: TVoiceRoomRestartIceResult;
  [EVoiceRoomEvent.ERROR]: void;
} & TDirectCallEventResultMap;

export type TVoiceRoomEventKey = EVoiceRoomEvent | EDirectCallEvent;

export type TVoiceRoomEventMap = {
  [K in TVoiceRoomEventKey]: TVoiceRoomEventPayloadMap[K] extends void
    ? (...args: unknown[]) => TVoiceRoomEventResultMap[K]
    : (
        data: TVoiceRoomEventPayloadMap[K],
        ...args: unknown[]
      ) => TVoiceRoomEventResultMap[K];
};

export type TVoiceRoomEvent = {
  [K in EVoiceRoomEvent]: {
    event: K;
    data: TVoiceRoomEventPayloadMap[K];
  };
}[EVoiceRoomEvent];
