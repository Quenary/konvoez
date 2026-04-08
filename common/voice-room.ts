import { UserCommon } from './user';

/**
 * Common namespace for voice rooms
 */
export namespace VoiceRoomCommon {
  /**
   * Voice room WS events
   */
  export enum EEvent {
    /**
     * Join room event
     * @data {@link IJoinRoom}
     */
    JOIN_ROOM = 'join-room',
    /**
     * Leave room event
     * @data {@link ILeaveRoom}
     */
    LEAVE_ROOM = 'leave-room',
    /**
     * Peer joined event
     * @data {@link IPeerLeft}
     */
    PEER_JOINED = 'peer-joined',
    /**
     * Peer left event
     * @data {@link IPeerLeft}
     */
    PEER_LEFT = 'peer-left',
    /**
     * Get existing peers of all rooms
     * to sync frontend state
     */
    GET_ALL_PEERS = 'get-all-peers',
    /**
     * Existing peers in current room event
     * Emits room's users to joined user
     * This event triggers initial signaling
     */
    PEERS_ON_JOIN = 'peers-on-join',
    //#region MediaSoup
    GET_RTP_CAPABILITIES = 'get-rtp-capabilities',
    CREATE_TRANSPORT = 'create-transport',
    CONNECT_TRANSPORT = 'connect-transport',
    PRODUCE = 'produce',
    PRODUCER_CREATED = 'producer-created',
    PRODUCER_CLOSED = 'producer-closed',
    CONSUME = 'consume',
    CONSUMER_CLOSED = 'consumer-closed',
    //#endregion
    ERROR = 'error',
  }
  export type TEventMap = {
    [EEvent.JOIN_ROOM]: (data: IJoinRoom, ...args: any[]) => any;
    [EEvent.LEAVE_ROOM]: (data: {}) => any;
    [EEvent.PEER_JOINED]: (data: IPeerJoined) => any;
    [EEvent.PEER_LEFT]: (data: IPeerLeft) => any;
    [EEvent.GET_ALL_PEERS]: () => IGetAllPeersResult;
    [EEvent.PEERS_ON_JOIN]: (data: IPeersOnJoin) => any;
    [EEvent.GET_RTP_CAPABILITIES]: () => any;
    [EEvent.CREATE_TRANSPORT]: (
      data: ICreateTransport,
      ...args: any[]
    ) => ICreateTransportResult;
    [EEvent.CONNECT_TRANSPORT]: (
      data: IConnectTransport,
      ...args: any[]
    ) => any;
    [EEvent.PRODUCE]: (data: IProduce, ...args: any[]) => IProduceResult;
    [EEvent.PRODUCER_CREATED]: (data: IProduceResult) => any;
    [EEvent.PRODUCER_CLOSED]: (data: IProducerClosed) => any;
    [EEvent.CONSUME]: (data: IConsume, ...args: any[]) => IConsumeResult;
    [EEvent.CONSUMER_CLOSED]: (data: IConsumerClosed) => any;
    [EEvent.ERROR]: (data: any) => any;
  };
  export type MediaTag = 'mic' | 'cam' | 'screen';
  export interface IJoinRoom {
    roomId: number;
  }
  export interface IPeerJoined {
    user: UserCommon.IUser;
    roomId: number;
  }
  export interface IPeerLeft {
    user: UserCommon.IUser;
    roomId: number;
  }
  /**
   * Map room id to map of users
   */
  export type IGetAllPeersResult = Record<
    number,
    Record<number, UserCommon.IUser>
  >;
  /**
   * Map user id to  info with producers
   */
  export type IPeersOnJoin = Record<number, IUserWithProducers>;
  export interface IUserWithProducers extends UserCommon.IUser {
    producers: IProduceResult[];
  }
  export interface ICreateTransport {
    direction: 'send' | 'recv';
    sctpCapabilities: any;
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
    mediaTag: MediaTag;
    rtpParameters: any;
  }
  export interface IProduceResult {
    producerId: string;
    userId: number;
    kind: 'audio' | 'video';
    mediaTag: MediaTag;
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
    mediaTag: MediaTag;
    rtpParameters: any;
  }
  export interface IConsumerClosed {
    consumerId: string;
  }
}
