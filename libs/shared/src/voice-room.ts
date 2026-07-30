/* eslint-disable @typescript-eslint/no-explicit-any */
import { IUser } from './user';

/**
 * Voice room WS events
 */
export const VoiceRoomEvent = {
  /**
   * Join room event
   * @data {@link IJoinRoom}
   */
  JOIN_ROOM: 'join-room',
  /**
   * Leave room event
   * @data {@link ILeaveRoom}
   */
  LEAVE_ROOM: 'leave-room',
  /**
   * Peer joined event
   * @data {@link IPeerLeft}
   */
  PEER_JOINED: 'peer-joined',
  /**
   * Peer left event
   * @data {@link IPeerLeft}
   */
  PEER_LEFT: 'peer-left',
  /**
   * Get existing peers of all rooms
   * to sync frontend state
   */
  GET_ALL_PEERS: 'get-all-peers',
  /**
   * Existing peers in current room event
   * Emits room's users to joined user
   * This event triggers initial signaling
   */
  PEERS_ON_JOIN: 'peers-on-join',
  //#region MediaSoup
  GET_RTP_CAPABILITIES: 'get-rtp-capabilities',
  CREATE_TRANSPORT: 'create-transport',
  CONNECT_TRANSPORT: 'connect-transport',
  PRODUCE: 'produce',
  PRODUCER_CREATED: 'producer-created',
  PRODUCER_CLOSED: 'producer-closed',
  CONSUME: 'consume',
  CONSUMER_CLOSED: 'consumer-closed',
  //#endregion
  ERROR: 'error',
} as const;
export type VoiceRoomEventMap = {
  [VoiceRoomEvent.JOIN_ROOM]: (data: IJoinRoom, ...args: any[]) => any;
  [VoiceRoomEvent.LEAVE_ROOM]: (data: object) => any;
  [VoiceRoomEvent.PEER_JOINED]: (data: IPeerJoined) => any;
  [VoiceRoomEvent.PEER_LEFT]: (data: IPeerLeft) => any;
  [VoiceRoomEvent.GET_ALL_PEERS]: () => IGetAllPeersResult;
  [VoiceRoomEvent.PEERS_ON_JOIN]: (data: IPeersOnJoin) => any;
  [VoiceRoomEvent.GET_RTP_CAPABILITIES]: () => any;
  [VoiceRoomEvent.CREATE_TRANSPORT]: (
    data: ICreateTransport,
    ...args: any[]
  ) => ICreateTransportResult;
  [VoiceRoomEvent.CONNECT_TRANSPORT]: (
    data: IConnectTransport,
    ...args: any[]
  ) => any;
  [VoiceRoomEvent.PRODUCE]: (data: IProduce, ...args: any[]) => IProduceResult;
  [VoiceRoomEvent.PRODUCER_CREATED]: (data: IProduceResult) => any;
  [VoiceRoomEvent.PRODUCER_CLOSED]: (data: IProducerClosed) => any;
  [VoiceRoomEvent.CONSUME]: (data: IConsume, ...args: any[]) => IConsumeResult;
  [VoiceRoomEvent.CONSUMER_CLOSED]: (data: IConsumerClosed) => any;
  [VoiceRoomEvent.ERROR]: (data: any) => any;
};
export type VoiceRoomMediaTag = 'mic' | 'cam' | 'screen';
export interface IJoinRoom {
  roomId: number;
}
export interface IPeerJoined {
  user: IUser;
  roomId: number;
}
export interface IPeerLeft {
  user: IUser;
  roomId: number;
}
/**
 * Map room id to map of users
 */
export type IGetAllPeersResult = Record<number, Record<number, IUser>>;
/**
 * Map user id to  info with producers
 */
export type IPeersOnJoin = Record<number, IUserWithProducers>;
export interface IUserWithProducers extends IUser {
  producers: IProduceResult[];
}
export interface ICreateTransport {
  direction: 'send' | 'recv';
}
export interface ICreateTransportResult {
  id: string;
  iceParameters: any;
  iceCandidates: any;
  dtlsParameters: any;
  sctpParameters: any;
}
export interface IConnectTransport {
  transportId: string;
  dtlsParameters: any;
}
export interface IProduce {
  transportId: string;
  kind: 'audio' | 'video';
  mediaTag: VoiceRoomMediaTag;
  rtpParameters: any;
}
export interface IProduceResult {
  producerId: string;
  userId: number;
  kind: 'audio' | 'video';
  mediaTag: VoiceRoomMediaTag;
}
export interface IProducerClosed {
  producerId: string;
  userId: number;
}
export interface IConsume {
  producerId: string;
  transportId: string;
  rtpCapabilities: any;
}
export interface IConsumeResult {
  id: string;
  producerId: string;
  kind: any;
  mediaTag: VoiceRoomMediaTag;
  rtpParameters: any;
}
export interface IConsumerClosed {
  consumerId: string;
}
