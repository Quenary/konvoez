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
  TVoiceSessionIdentity,
  getVoiceSessionKey,
  isGroupVoiceSession,
  parseVoiceSessionKey,
  EVoiceSessionType,
} from '@konvoez/shared';
import {
  Consumer,
  Producer,
  Router as MediasoupRouter,
  WebRtcTransport,
  Worker as MediasoupWorker,
} from 'mediasoup/types';
import { createWorker } from 'mediasoup';
import { announcedAddressKey } from '@shared/utils/mediasoup-addresses.util';
import { AppService } from '@shared/services/app.service';

type VoiceRoomState = {
  /**
   * Typed session identity (group room or direct call).
   */
  target: TVoiceSessionIdentity;
  /**
   * Socket.io / map key derived from target.
   */
  id: string;
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
  private readonly rooms = new Map<string, VoiceRoomState>();
  private readonly roomInitByKey = new Map<string, Promise<VoiceRoomState>>();

  constructor(private readonly appService: AppService) {}

  public async onModuleInit(): Promise<void> {
    this.worker = await createWorker();
    this.logger.log(
      `Mediasoup worker started (announced ${this.appService.MEDIASOUP_ANNOUNCED_ADDRESSES.map(announcedAddressKey).join(', ')})`,
    );
  }

  public async onModuleDestroy(): Promise<void> {
    this.worker.close();
    this.logger.log('Mediasoup worker destroyed');
  }

  public async ensureRoom(
    target: TVoiceSessionIdentity,
  ): Promise<VoiceRoomState> {
    const sessionKey = getVoiceSessionKey(target);
    const existing = this.rooms.get(sessionKey);
    if (existing && !existing.router.closed) {
      return existing;
    }

    // Serialize concurrent creates for the same session (caller + callee join).
    let pending = this.roomInitByKey.get(sessionKey);
    if (!pending) {
      pending = this.createRoom(target, sessionKey).finally(() => {
        this.roomInitByKey.delete(sessionKey);
      });
      this.roomInitByKey.set(sessionKey, pending);
    }

    return pending;
  }

  public getRoom(key: string): VoiceRoomState | undefined {
    return this.rooms.get(key);
  }

  public async removeRoom(key: string): Promise<void> {
    if (this.rooms.has(key)) {
      const room = this.rooms.get(key) as VoiceRoomState;
      this.logger.debug(`Removing voice room: sessionKey=${key}`);
      room.router.close();
      this.rooms.delete(key);
    }
  }

  public getPeersOnJoin(key: string): TVoiceRoomPeersOnJoin {
    const room = this.rooms.get(key);
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
    for (const room of this.rooms.values()) {
      if (!isGroupVoiceSession(room.target)) {
        continue;
      }
      result[room.target.roomId] = Array.from(room.peers.values()).reduce(
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

  public resolveIdentityFromKey(key: string): TVoiceSessionIdentity | null {
    return parseVoiceSessionKey(key);
  }

  public createGroupIdentity(roomId: number): TVoiceSessionIdentity {
    return { type: EVoiceSessionType.GROUP_ROOM, roomId };
  }

  public createDirectCallIdentity(callId: string): TVoiceSessionIdentity {
    return { type: EVoiceSessionType.DIRECT_CALL, callId };
  }

  private async createRoom(
    target: TVoiceSessionIdentity,
    sessionKey: string,
  ): Promise<VoiceRoomState> {
    const existing = this.rooms.get(sessionKey);
    if (existing && !existing.router.closed) {
      return existing;
    }

    if (existing?.router.closed) {
      this.rooms.delete(sessionKey);
    }

    const room: VoiceRoomState = {
      target,
      id: sessionKey,
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
    this.rooms.set(sessionKey, room);
    return room;
  }
}
