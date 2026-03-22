import { EUserRole } from './enums';

/**
 * Common namespace for voice rooms
 */
export namespace VoiceRoomCommon {
  /**
   * Voice room WS events
   */
  export enum EEvent {
    /**
     * Signaling event for webrtc
     * @data {@link ISignal}
     */
    SIGNAL = 'signal',
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
     * Existing peers in all rooms changed event
     * Emits all users in all rooms
     * @data {@link IExistingPeers}
     */
    EXISTING_PEERS_ALL = 'existing-peers-all',
    /**
     * Existing peers in current room event
     * Emits room's users to joined user
     * This event triggers initial signaling
     */
    EXISTING_PEERS_ON_JOIN = 'existing-peers-on-join',
    ERROR = 'error',
  }
  export type TEventMap = {
    [EEvent.SIGNAL]: (data: ISignal) => any;
    [EEvent.JOIN_ROOM]: (data: IJoinRoom) => any;
    [EEvent.LEAVE_ROOM]: (data: {}) => any;
    [EEvent.PEER_JOINED]: (data: IPeerJoined) => any;
    [EEvent.PEER_LEFT]: (data: IPeerLeft) => any;
    [EEvent.EXISTING_PEERS_ALL]: (data: IRoomWithPeers[]) => any;
    [EEvent.EXISTING_PEERS_ON_JOIN]: (data: IRoomWithPeers) => any;
    [EEvent.ERROR]: (data: any) => any;
  };

  export interface ISignal {
    /**
     * ID клиента отправителя
     */
    from?: string;
    /**
     * ID клиента получателя
     */
    to?: string;
    payload: {
      sdi?: RTCSessionDescriptionInit;
      candidate?: RTCIceCandidateInit;
    };
  }
  export interface IJoinRoom {
    roomId: number;
  }
  export interface IPeerJoined {
    peer: IPeer;
    roomId: number;
  }
  export interface IPeerLeft {
    peer: IPeer;
    roomId: number;
  }

  // TODO move to separate file
  export interface IPeer {
    /**
     * ID of the socket session
     */
    clientId: string;
    id: number;
    role: EUserRole;
    username: string;
    avatar: string | null;
  }
  export interface IRoomWithPeers {
    roomId: number;
    peers: IPeer[];
  }
}
