import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  TVoiceRoomGetAllPeersResult,
  TVoiceRoomPeersOnJoin,
  IUser,
  IVoiceRoomUserWithProducers,
  TVoiceRoomMediaTag,
} from '@konvoez/shared';
import {
  Consumer,
  Producer,
  Router as MediasoupRouter,
  WebRtcTransport,
  Worker as MediasoupWorker,
} from 'mediasoup/types';
import { createWorker } from 'mediasoup';
import { AppService } from '@shared/services/app.service';

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
  user: IUser;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producers: Map<string, Producer<VoiceRoomStateMediasoupAppData>>;
  consumers: Map<string, Consumer<VoiceRoomStateMediasoupAppData>>;
};

export type VoiceRoomStateMediasoupAppData = {
  peerId: string;
  mediaTag: TVoiceRoomMediaTag;
};

@Injectable()
export class VoiceRoomsStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoiceRoomsStateService.name);
  private worker!: MediasoupWorker;
  private readonly rooms = new Map<number, VoiceRoomState>();

  constructor(private readonly appService: AppService) {}

  async onModuleInit() {
    this.worker = await createWorker({
      rtcMinPort: this.appService.MEDIASOUP_MIN_PORT,
      rtcMaxPort: this.appService.MEDIASOUP_MAX_PORT,
    });
    this.logger.log(
      `Mediasoup worker started (ports ${this.appService.MEDIASOUP_MIN_PORT}-${this.appService.MEDIASOUP_MAX_PORT})`,
    );
  }

  async onModuleDestroy() {
    this.worker.close();
    this.logger.log('Mediasoup worker destroyed');
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
      const room = this.rooms.get(roomId) as VoiceRoomState;
      this.logger.debug(`Removing voice room: roomId=${roomId}`);
      room.router.close();
      this.rooms.delete(roomId);
    }
  }

  public getPeersOnJoin(roomId: number): TVoiceRoomPeersOnJoin {
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
        } satisfies IVoiceRoomUserWithProducers,
      }),
      {},
    );
  }

  public getAllPeers(): TVoiceRoomGetAllPeersResult {
    const result: TVoiceRoomGetAllPeersResult = {};
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
