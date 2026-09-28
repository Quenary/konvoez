/* eslint-disable @typescript-eslint/no-explicit-any */
import { IUser } from './user.schemas';
import { EDirectCallEvent, EVoiceRoomEvent } from '../enums';
import {
  TDirectCallEventPayloadMap,
  TDirectCallEventResultMap,
  TVoiceSessionTarget,
} from './voice-session.schemas';

export type TVoiceRoomMediaTag = 'mic' | 'cam' | 'screen';

export type TVoiceRoomEventPayloadMap = {
  [EVoiceRoomEvent.JOIN_ROOM]: IVoiceRoomJoin;
  [EVoiceRoomEvent.LEAVE_ROOM]: void;
  [EVoiceRoomEvent.PEER_JOINED]: IVoiceRoomPeerJoined;
  [EVoiceRoomEvent.PEER_LEFT]: IVoiceRoomPeerLeft;
  [EVoiceRoomEvent.GET_ALL_PEERS]: void;
  [EVoiceRoomEvent.PEERS_ON_JOIN]: TVoiceRoomPeersOnJoin;
  [EVoiceRoomEvent.GET_RTP_CAPABILITIES]: void;
  [EVoiceRoomEvent.CREATE_TRANSPORT]: IVoiceRoomCreateTransport;
  [EVoiceRoomEvent.CONNECT_TRANSPORT]: IVoiceRoomConnectTransport;
  [EVoiceRoomEvent.PRODUCE]: IVoiceRoomProduce;
  [EVoiceRoomEvent.PRODUCER_CREATED]: IVoiceRoomProduceResult;
  [EVoiceRoomEvent.PRODUCER_CLOSED]: IVoiceRoomProducerClosed;
  [EVoiceRoomEvent.CONSUME]: IVoiceRoomConsume;
  [EVoiceRoomEvent.CONSUMER_CLOSED]: IVoiceRoomConsumerClosed;
  [EVoiceRoomEvent.ERROR]: { message: string };
} & TDirectCallEventPayloadMap;

export type TVoiceRoomEventResultMap = {
  [EVoiceRoomEvent.JOIN_ROOM]: any;
  [EVoiceRoomEvent.LEAVE_ROOM]: any;
  [EVoiceRoomEvent.PEER_JOINED]: any;
  [EVoiceRoomEvent.PEER_LEFT]: any;
  [EVoiceRoomEvent.GET_ALL_PEERS]: TVoiceRoomGetAllPeersResult;
  [EVoiceRoomEvent.PEERS_ON_JOIN]: any;
  [EVoiceRoomEvent.GET_RTP_CAPABILITIES]: any;
  [EVoiceRoomEvent.CREATE_TRANSPORT]: IVoiceRoomCreateTransportResult;
  [EVoiceRoomEvent.CONNECT_TRANSPORT]: any;
  [EVoiceRoomEvent.PRODUCE]: IVoiceRoomProduceResult;
  [EVoiceRoomEvent.PRODUCER_CREATED]: any;
  [EVoiceRoomEvent.PRODUCER_CLOSED]: any;
  [EVoiceRoomEvent.CONSUME]: IVoiceRoomConsumeResult;
  [EVoiceRoomEvent.CONSUMER_CLOSED]: any;
  [EVoiceRoomEvent.ERROR]: any;
} & TDirectCallEventResultMap;

export type TVoiceRoomEventKey = EVoiceRoomEvent | EDirectCallEvent;

export type TVoiceRoomEventMap = {
  [K in TVoiceRoomEventKey]: TVoiceRoomEventPayloadMap[K] extends void
    ? (...args: any[]) => TVoiceRoomEventResultMap[K]
    : (
        data: TVoiceRoomEventPayloadMap[K],
        ...args: any[]
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

/**
 * Map group room id to map of users currently in that voice room.
 * Direct-call sessions are intentionally excluded.
 */
export type TVoiceRoomGetAllPeersResult = Record<number, Record<number, IUser>>;

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
  iceParameters: any;
  iceCandidates: any;
  dtlsParameters: any;
  sctpParameters: any;
}

export interface IVoiceRoomConnectTransport {
  transportId: string;
  dtlsParameters: any;
}

export interface IVoiceRoomProduce {
  transportId: string;
  kind: 'audio' | 'video';
  mediaTag: TVoiceRoomMediaTag;
  rtpParameters: any;
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

export interface IVoiceRoomConsume {
  producerId: string;
  transportId: string;
  rtpCapabilities: any;
}

export interface IVoiceRoomConsumeResult {
  id: string;
  producerId: string;
  kind: any;
  mediaTag: TVoiceRoomMediaTag;
  rtpParameters: any;
}

export interface IVoiceRoomConsumerClosed {
  consumerId: string;
}
