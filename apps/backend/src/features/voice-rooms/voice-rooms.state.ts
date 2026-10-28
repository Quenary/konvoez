import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TVoiceRoomGetAllPeersSnapshot,
  TVoiceRoomLobbyPeerJoined,
  TVoiceRoomLobbyPeerLeft,
  TVoiceRoomLobbyPeerMuted,
  TVoiceRoomPeerUser,
  TVoiceRoomGetAllPeersResult,
  TVoiceRoomPeersOnJoin,
  IUserSafe,
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
import {
  VoiceRoomsDomainEvents,
  emitVoiceRoomsDomainEvent,
} from './voice-rooms.events';
import { Mutex } from 'async-mutex';
import { VOICE_ROOM_MEDIA_CODECS } from './voice-media.util';

export type VoiceRoomState = {
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
  /**
   * Serializes PRODUCE calls per room to prevent race conditions on limits
   * and replace-by-tag.
   */
  produceMutex: Mutex;
};

type VoiceRoomStatePeer = {
  /**
   * Socket id
   */
  id: string;
  /**
   * User info
   */
  user: IUserSafe;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;
  producers: Map<string, Producer<VoiceRoomStateMediasoupAppData>>;
  consumers: Map<string, Consumer<VoiceRoomStateMediasoupAppData>>;
  muted: boolean;
  deafened: boolean;
};

export type VoiceRoomStateMediasoupAppData = {
  peerId: string;
  mediaTag: TVoiceRoomMediaTag;
  sourceHeight?: number;
};

@Injectable()
export class VoiceRoomsStateService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VoiceRoomsStateService.name);
  private worker!: MediasoupWorker;
  private readonly rooms = new Map<string, VoiceRoomState>();
  private readonly roomInitByKey = new Map<string, Promise<VoiceRoomState>>();
  private readonly lobbyEpoch = randomUUID();
  private lobbyRevision = 0;

  constructor(
    private readonly appService: AppService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  public async onModuleInit(): Promise<void> {
    this.worker = await createWorker();
    this.worker.on('died', (error) => {
      this.logger.error('Mediasoup worker died', error);
      process.exit(1);
    });
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
    const room = this.rooms.get(key);
    if (!room) {
      return;
    }
    this.logger.debug(`Removing voice room: sessionKey=${key}`);
    this.emitLobbyPeerLeftForEvictedPeers(room);
    if (!room.router.closed) {
      room.router.close();
    }
    this.rooms.delete(key);
  }

  public getPeersOnJoin(key: string): TVoiceRoomPeersOnJoin {
    const room = this.rooms.get(key);
    if (!room) {
      return {};
    }
    const result: TVoiceRoomPeersOnJoin = {};
    for (const curr of room.peers.values()) {
      result[curr.user.id] = {
        ...curr.user,
        muted: curr.muted,
        deafened: curr.deafened,
        producers: Array.from(curr.producers.values()).map((p) => ({
          userId: curr.user.id,
          producerId: p.id,
          peerId: p.id,
          kind: p.kind,
          mediaTag: p.appData.mediaTag,
        })),
      };
    }
    return result;
  }

  public getAllPeers(): TVoiceRoomGetAllPeersResult {
    const result: TVoiceRoomGetAllPeersResult = {};
    for (const room of this.rooms.values()) {
      if (!isGroupVoiceSession(room.target)) {
        continue;
      }
      const roomPeers: Record<number, TVoiceRoomPeerUser> = {};
      for (const curr of room.peers.values()) {
        roomPeers[curr.user.id] = {
          ...curr.user,
          muted: curr.muted,
          deafened: curr.deafened,
        };
      }
      result[room.target.roomId] = roomPeers;
    }
    return result;
  }

  public getLobbySnapshot(): TVoiceRoomGetAllPeersSnapshot {
    return {
      epoch: this.lobbyEpoch,
      revision: this.lobbyRevision,
      rooms: this.getAllPeers(),
    };
  }

  public createLobbyPeerJoined(
    roomId: number,
    user: IUserSafe,
    muted = false,
    deafened = false,
  ): TVoiceRoomLobbyPeerJoined {
    return { roomId, user, muted, deafened, ...this.nextLobbyVersion() };
  }

  public createLobbyPeerLeft(
    roomId: number,
    userId: number,
  ): TVoiceRoomLobbyPeerLeft {
    return { roomId, userId, ...this.nextLobbyVersion() };
  }

  public createLobbyPeerMuted(
    roomId: number,
    userId: number,
    muted: boolean,
    deafened: boolean,
  ): TVoiceRoomLobbyPeerMuted {
    return { roomId, userId, muted, deafened, ...this.nextLobbyVersion() };
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

  private nextLobbyVersion(): { epoch: string; revision: number } {
    this.lobbyRevision += 1;
    return { epoch: this.lobbyEpoch, revision: this.lobbyRevision };
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
      this.emitLobbyPeerLeftForEvictedPeers(existing);
      this.rooms.delete(sessionKey);
    }

    const room: VoiceRoomState = {
      target,
      id: sessionKey,
      router: await this.worker.createRouter({
        mediaCodecs: VOICE_ROOM_MEDIA_CODECS,
      }),
      peers: new Map(),
      producers: new Map(),
      produceMutex: new Mutex(),
    };
    this.rooms.set(sessionKey, room);
    return room;
  }

  private emitLobbyPeerLeftForEvictedPeers(room: VoiceRoomState): void {
    if (!isGroupVoiceSession(room.target)) {
      return;
    }
    const roomId = room.target.roomId;
    const notifiedUserIds = new Set<number>();
    for (const peer of room.peers.values()) {
      if (notifiedUserIds.has(peer.user.id)) {
        continue;
      }
      notifiedUserIds.add(peer.user.id);
      emitVoiceRoomsDomainEvent(
        this.eventEmitter,
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
        this.createLobbyPeerLeft(roomId, peer.user.id),
      );
    }
  }
}
