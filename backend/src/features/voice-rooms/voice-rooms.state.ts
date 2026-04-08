import { Injectable, OnModuleInit } from '@nestjs/common';
import { UserCommon } from '@common/user';
import { VoiceRoomCommon } from '@common/voice-room';
import {
  Consumer,
  Producer,
  Router as MediasoupRouter,
  WebRtcTransport,
  Worker as MediasoupWorker,
} from 'mediasoup/types';
import { createWorker } from 'mediasoup';

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
export class VoiceRoomsStateService implements OnModuleInit {
  private worker: MediasoupWorker;
  private readonly rooms = new Map<number, VoiceRoomState>();

  async onModuleInit() {
    this.worker = await createWorker({
      rtcMinPort: 40000,
      rtcMaxPort: 49999,
    });
    console.info('Mediasoup worker started');
  }

  public async ensureRoom(roomId: number): Promise<VoiceRoomState> {
    let room = this.rooms.get(roomId);
    if (!room || room.router.closed) {
      room = {
        id: roomId,
        router: await this.worker.createRouter({
          mediaCodecs: [
            {
              kind: 'audio',
              mimeType: 'audio/opus',
              clockRate: 48000,
              channels: 2,
            },
          ],
        }),
        peers: new Map(),
        producers: new Map(),
      };
      this.rooms.set(roomId, room);
    }
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

  public getPeersOnJoin(roomId: number): VoiceRoomCommon.IPeersOnJoin {
    const room = this.rooms.get(roomId);
    if (!room) {
      return {};
    }
    return Array.from(room.peers.values()).reduce(
      (prev, curr) => ({
        ...prev,
        [curr.user.id]: {
          ...curr.user,
          producers: Array.from(curr.producers.values()).map((p) => ({
            userId: curr.user.id,
            producerId: p.id,
            peerId: p.id,
            kind: p.kind,
            mediaTag: p.appData.mediaTag,
          })),
        } satisfies VoiceRoomCommon.IUserWithProducers,
      }),
      {},
    );
  }

  public getAllPeers(): VoiceRoomCommon.IGetAllPeersResult {
    const result: VoiceRoomCommon.IGetAllPeersResult = {};
    for (const [roomId, room] of this.rooms) {
      result[roomId] = Array.from(room.peers.values()).reduce(
        (prev, curr) => ({
          ...prev,
          [curr.user.id]: {
            ...curr.user,
          },
        }),
        {},
      );
    }
    return result;
  }
}
