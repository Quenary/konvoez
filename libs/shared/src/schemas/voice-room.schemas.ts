import { IUser } from './user.schemas';
import { EDirectCallEvent, EVoiceRoomEvent } from '../enums';
import {
  TDirectCallEventPayloadMap,
  TDirectCallEventResultMap,
  TVoiceSessionTarget,
} from './voice-session.schemas';

export type TVoiceRoomMediaTag = 'mic' | 'cam' | 'screen' | 'screen-audio';

export type TVoiceRoomEventPayloadMap = {
  [EVoiceRoomEvent.JOIN_ROOM]: IVoiceRoomJoin;
  [EVoiceRoomEvent.LEAVE_ROOM]: void;
  [EVoiceRoomEvent.PEER_JOINED]: IVoiceRoomPeerJoined;
  [EVoiceRoomEvent.PEER_LEFT]: IVoiceRoomPeerLeft;
  [EVoiceRoomEvent.ROOM_CLOSED]: IVoiceRoomClosed;
  [EVoiceRoomEvent.GET_ALL_PEERS]: void;
  [EVoiceRoomEvent.PEERS_ON_JOIN]: TVoiceRoomPeersOnJoin;
  [EVoiceRoomEvent.GET_RTP_CAPABILITIES]: void;
  [EVoiceRoomEvent.CREATE_TRANSPORT]: IVoiceRoomCreateTransport;
  [EVoiceRoomEvent.CONNECT_TRANSPORT]: IVoiceRoomConnectTransport;
  [EVoiceRoomEvent.PRODUCE]: IVoiceRoomProduce;
  [EVoiceRoomEvent.PRODUCER_CREATED]: IVoiceRoomProduceResult;
  [EVoiceRoomEvent.PRODUCER_CLOSED]: IVoiceRoomProducerClosed;
  [EVoiceRoomEvent.CLOSE_PRODUCER]: IVoiceRoomCloseProducer;
  [EVoiceRoomEvent.CONSUME]: IVoiceRoomConsume;
  [EVoiceRoomEvent.CLOSE_CONSUMER]: IVoiceRoomCloseConsumer;
  [EVoiceRoomEvent.CONSUMER_CLOSED]: IVoiceRoomConsumerClosed;
  [EVoiceRoomEvent.ERROR]: { message: string };
} & TDirectCallEventPayloadMap;

export type TVoiceRoomEventResultMap = {
  [EVoiceRoomEvent.JOIN_ROOM]: object;
  [EVoiceRoomEvent.LEAVE_ROOM]: object;
  [EVoiceRoomEvent.PEER_JOINED]: void;
  [EVoiceRoomEvent.PEER_LEFT]: void;
  [EVoiceRoomEvent.ROOM_CLOSED]: void;
  [EVoiceRoomEvent.GET_ALL_PEERS]: IVoiceRoomGetAllPeersSnapshot;
  [EVoiceRoomEvent.PEERS_ON_JOIN]: void;
  /** Opaque mediasoup RtpCapabilities JSON */
  [EVoiceRoomEvent.GET_RTP_CAPABILITIES]: unknown;
  [EVoiceRoomEvent.CREATE_TRANSPORT]: IVoiceRoomCreateTransportResult;
  [EVoiceRoomEvent.CONNECT_TRANSPORT]: object;
  [EVoiceRoomEvent.PRODUCE]: IVoiceRoomProduceResult;
  [EVoiceRoomEvent.PRODUCER_CREATED]: void;
  [EVoiceRoomEvent.PRODUCER_CLOSED]: void;
  [EVoiceRoomEvent.CLOSE_PRODUCER]: object;
  [EVoiceRoomEvent.CONSUME]: IVoiceRoomConsumeResult;
  [EVoiceRoomEvent.CLOSE_CONSUMER]: object;
  [EVoiceRoomEvent.CONSUMER_CLOSED]: void;
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

export interface IVoiceRoomJoin {
  roomId?: number;
  sessionTarget?: TVoiceSessionTarget;
  sessionKey?: string;
}

export interface IVoiceRoomPeerJoined {
  user: IUser;
  roomId?: number;
  sessionKey: string;
}

export interface IVoiceRoomPeerLeft {
  user: IUser;
  roomId?: number;
  sessionKey: string;
}

export interface IVoiceRoomClosed {
  roomId: number;
  sessionKey: string;
  reason: 'deleted';
}

/**
 * Map group room id to map of users currently in that voice room.
 * Direct-call sessions are intentionally excluded.
 */
export type TVoiceRoomGetAllPeersResult = Record<number, Record<number, IUser>>;

/**
 * `epoch` identifies the server process that owns `revision`;
 * the revision counter restarts from 0 whenever the epoch changes.
 */
export interface IVoiceRoomGetAllPeersSnapshot {
  epoch: string;
  revision: number;
  rooms: TVoiceRoomGetAllPeersResult;
}

export interface IVoiceRoomLobbyPeerJoined {
  roomId: number;
  user: IUser;
  epoch: string;
  revision: number;
}

export interface IVoiceRoomLobbyPeerLeft {
  roomId: number;
  userId: number;
  epoch: string;
  revision: number;
}

/**
 * Map user id to info with producers
 */
export type TVoiceRoomPeersOnJoin = Record<number, IVoiceRoomUserWithProducers>;

export interface IVoiceRoomUserWithProducers extends IUser {
  producers: IVoiceRoomProduceResult[];
}

export interface IVoiceRoomCreateTransport {
  direction: 'send' | 'recv';
}

export interface IVoiceRoomCreateTransportResult {
  id: string;
  /** Opaque mediasoup IceParameters JSON */
  iceParameters: unknown;
  /** Opaque mediasoup IceCandidate[] JSON */
  iceCandidates: unknown;
  /** Opaque mediasoup DtlsParameters JSON */
  dtlsParameters: unknown;
  /** Opaque mediasoup SctpParameters JSON */
  sctpParameters: unknown;
}

export interface IVoiceRoomConnectTransport {
  transportId: string;
  /** Opaque mediasoup DtlsParameters JSON */
  dtlsParameters: unknown;
}

export interface IVoiceRoomProduce {
  transportId: string;
  kind: 'audio' | 'video';
  mediaTag: TVoiceRoomMediaTag;
  /** Opaque mediasoup RtpParameters JSON */
  rtpParameters: unknown;
}

export interface IVoiceRoomProduceResult {
  producerId: string;
  userId: number;
  kind: 'audio' | 'video';
  mediaTag: TVoiceRoomMediaTag;
}

export interface IVoiceRoomProducerClosed {
  producerId: string;
  userId: number;
}

export interface IVoiceRoomCloseProducer {
  producerId: string;
}

export interface IVoiceRoomConsume {
  producerId: string;
  transportId: string;
  /** Opaque mediasoup RtpCapabilities JSON */
  rtpCapabilities: unknown;
}

export interface IVoiceRoomConsumeResult {
  id: string;
  producerId: string;
  kind: 'audio' | 'video';
  mediaTag: TVoiceRoomMediaTag;
  /** Opaque mediasoup RtpParameters JSON */
  rtpParameters: unknown;
}

export interface IVoiceRoomCloseConsumer {
  consumerId: string;
}

export interface IVoiceRoomConsumerClosed {
  consumerId: string;
}
