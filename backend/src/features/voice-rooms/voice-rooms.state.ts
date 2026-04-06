import { Injectable } from '@nestjs/common';
import { MediasoupService } from './mediasoup.service';
import { UserCommon } from '@common/user';
import { VoiceRoomCommon } from '@common/voice-room';
import {
  Consumer,
  Producer,
  Router as MediasoupRouter,
  WebRtcTransport,
} from 'mediasoup/types';

type VoiceRoomState = {
  /**
   * ID of the room
   */
  id: number;
  router: MediasoupRouter;
  /**
   * Map peer (socket id) to peer state
   */
  peers: Map<string, VoiceRoomStatePeer>;
  /**
   * Map producer id to producer state
   */
  producers: Map<string, Producer<VoiceRoomStateMediasoupAppData>>;
};

type VoiceRoomStatePeer = {
  /**
   * Socket id
   */
  id: string;
  /**
   * User info
   */
  user: UserCommon.IUser;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producers: Map<string, Producer<VoiceRoomStateMediasoupAppData>>;
  consumers: Map<string, Consumer<VoiceRoomStateMediasoupAppData>>;
};

export type VoiceRoomStateMediasoupAppData = {
  peerId: string;
  mediaTag: VoiceRoomCommon.MediaTag;
};

@Injectable()
export class VoiceRoomsStateService {
  private readonly rooms = new Map<number, VoiceRoomState>();

  constructor(private readonly mediasoupService: MediasoupService) {}

  public async ensureRoom(roomId: number): Promise<VoiceRoomState> {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }
    const room = {
      id: roomId,
      router: await this.mediasoupService.ensureRouter(roomId),
      peers: new Map(),
      producers: new Map(),
    };
    this.rooms.set(roomId, room);
    return room;
  }

  public getRoom(roomId: number): VoiceRoomState | undefined {
    return this.rooms.get(roomId);
  }

  public async removeRoom(roomId: number) {
    if (this.rooms.has(roomId)) {
      const room = this.rooms.get(roomId)!;
      room.router.close();
      this.rooms.delete(roomId);
    }
  }

  public getRoomWithPeers(roomId: number): VoiceRoomCommon.IRoomWithUsers {
    const room = this.rooms.get(roomId)!;
    return {
      roomId,
      users: Array.from(room.peers.values()).map((p) => ({
        ...p.user,
        producers: Array.from(p.producers.values()).map((p) => ({
          producerId: p.id,
          peerId: p.id,
          kind: p.kind,
          mediaTag: p.appData.mediaTag,
        })),
      })),
    };
  }

  public getRoomsWithUsers(): VoiceRoomCommon.IRoomWithUsers[] {
    return Array.from(this.rooms.keys()).map((roomId) =>
      this.getRoomWithPeers(roomId),
    );
  }
}
