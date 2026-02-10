export namespace VoiceSocket {
  export enum EEvent {
    SIGNAL = '/voice/signal',
    JOIN_ROOM = '/voice/join-room',
    EXISTING_PEERS = 'voice/existing-peers',
    PEER_JOINED = 'voice/peer-joined',
    PEER_LEFT = 'voice/peer-left',
  }
  export type TEventData = {
    [EEvent.SIGNAL]: ISignal;
    [EEvent.JOIN_ROOM]: IJoinRoom;
    [EEvent.PEER_LEFT]: IPeerLeft;
  };
  export interface ISignal {
    from: string;
    payload: any;
  }
  export interface IJoinRoom {
    roomId: number;
  }
  export interface IPeerLeft {
    peerId: string;
  }
}
