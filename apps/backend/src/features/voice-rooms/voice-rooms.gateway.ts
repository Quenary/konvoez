import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, UseFilters, UsePipes } from '@nestjs/common';
import { WsAckExceptionFilter } from '@shared/filters/ws-ack-exception.filter';
import { AppException } from '@shared/errors/app.exception';
import { Socket, Server, DefaultEventsMap } from 'socket.io';
import { ZodValidationPipe } from 'nestjs-zod';
import {
  type TVoiceRoomConsumeResult,
  type TVoiceRoomCreateTransportResult,
  type TVoiceRoomGetAllPeersSnapshot,
  type TVoiceRoomProduceResult,
  type TVoiceRoomProducerClosed,
  type TVoiceRoomPeerMuted,
  type IUserSafe,
  EVoiceRoomEvent,
  EDirectCallEvent,
  ESocketEvent,
  type TVoiceRoomRestartIceResult,
  type TVoiceRoomSessionCheckResult,
  type TVoiceRoomEventMap,
  getVoiceSessionKey,
  EVoiceSessionType,
  toVoiceSessionIdentity,
  type TCallGetActiveResult,
  type TVoiceSessionIdentity,
  isDirectCallVoiceSession,
  ApiErrorCode,
  DIRECT_CALL_RING_TIMEOUT_MS,
  EPermission,
} from '@konvoez/shared';
import {
  CallAcceptDto,
  CallGetActiveDto,
  CallHangupDto,
  CallInitiateDto,
  CallRejectDto,
  VoiceRoomCloseConsumerDto,
  VoiceRoomCloseProducerDto,
  VoiceRoomConnectTransportDto,
  VoiceRoomConsumeDto,
  VoiceRoomCreateTransportDto,
  VoiceRoomJoinDto,
  VoiceRoomProduceDto,
  VoiceRoomRestartIceDto,
  VoiceRoomSetMuteStateDto,
} from './voice-rooms.dto';
import { AuthService } from '../auth/auth.service';
import { RoomsFacade } from '../rooms/rooms.facade';
import { AppService } from '@shared/services/app.service';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  NotificationsDomainEvents,
  emitNotificationsDomainEvent,
} from '../notifications/notifications.events';
import {
  VoiceRoomsDomainEvents,
  emitVoiceRoomsDomainEvent,
} from './voice-rooms.events';
import { RoomsDomainEvents } from '../rooms/rooms.events';
import {
  VoiceRoomsStateService,
  VoiceRoomStateMediasoupAppData,
} from './voice-rooms.state';
import { DirectCallsStateService } from './direct-calls.state';
import {
  buildWebRtcListenInfos,
  resolveAnnouncedAddresses,
} from './webrtc-listen-infos';
import {
  assertKindMatchesMediaTag,
  assertKnownMediaTag,
  assertScreenAudioAllowed,
  isVideoMediaTag,
  MAX_ROOM_VIDEO_PRODUCERS,
} from './voice-media.util';
import { Consumer, Producer, WebRtcTransport } from 'mediasoup/types';
import type {
  DtlsParameters,
  RtpCapabilities,
  RtpParameters,
} from 'mediasoup/types';

type TSocket = Socket<
  TVoiceRoomEventMap,
  TVoiceRoomEventMap,
  DefaultEventsMap,
  {
    roomId?: number;
    sessionKey?: string;
    sessionTarget?: TVoiceSessionIdentity;
    user: IUserSafe;
  }
>;

const DIRECT_CALL_CALLER_RECONNECT_GRACE_MS = 5_000;

@UseFilters(WsAckExceptionFilter)
@UsePipes(ZodValidationPipe)
@WebSocketGateway({
  path: '/ws/v1/voice',
  cors: { origin: '*' },
})
export class VoiceRoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(VoiceRoomsGateway.name);
  private readonly ringTimers = new Map<string, NodeJS.Timeout>();
  private readonly callerDisconnectTimers = new Map<string, NodeJS.Timeout>();

  @WebSocketServer()
  private readonly server!: Server<TVoiceRoomEventMap>;

  constructor(
    private readonly authService: AuthService,
    private readonly appService: AppService,
    private readonly roomsFacade: RoomsFacade,
    private readonly voiceRoomsStateService: VoiceRoomsStateService,
    private readonly directCallsStateService: DirectCallsStateService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(RoomsDomainEvents.ROOM_DELETED)
  handleRoomDeletedEvent({ id }: { id: number }): void {
    const sessionKey = getVoiceSessionKey({
      type: EVoiceSessionType.GROUP_ROOM,
      roomId: id,
    });
    const room = this.voiceRoomsStateService.getRoom(sessionKey);
    if (!room) {
      return;
    }

    const peerSocketIds = [...room.peers.keys()];
    for (const socketId of peerSocketIds) {
      const socket = this.server.sockets.sockets.get(socketId) as
        TSocket | undefined;
      if (socket) {
        socket.emit(EVoiceRoomEvent.ROOM_CLOSED, {
          roomId: id,
          sessionKey,
          reason: 'deleted',
        });
        this.handleLeaveRoom(socket);
      }
    }

    if (this.voiceRoomsStateService.getRoom(sessionKey)) {
      void this.voiceRoomsStateService.removeRoom(sessionKey);
    }
  }

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        this.logger.warn(
          `Unauthorized socket connection attempt: socketId=${client.id}`,
        );
        client.emit(EVoiceRoomEvent.ERROR, {
          message: 'Unauthorized',
        });
        client.disconnect(true);
        return;
      }

      client.data.user = user;
      client.join(user.id.toString());
      for (const call of this.directCallsStateService.findRingingByCaller(
        user.id,
      )) {
        this.clearCallerDisconnectTimer(call.callId);
      }
      this.logger.debug(
        `Socket connected: socketId=${client.id}, userId=${user.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Socket auth failed: socketId=${client.id}, message=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      client.emit(EVoiceRoomEvent.ERROR, {
        message: 'Unauthorized',
      });
      client.disconnect(true);
    }
  }

  async handleDisconnect(socket: TSocket): Promise<void> {
    this.handleLeaveRoom(socket);

    const user = socket.data.user;
    if (!user) {
      return;
    }

    const userId = user.id.toString();
    const remaining = await this.server.in(userId).fetchSockets();
    if (remaining.length > 0) {
      return;
    }

    for (const call of this.directCallsStateService.findRingingByCaller(
      user.id,
    )) {
      this.scheduleCallerDisconnectCancel(call.callId, user.id);
    }
  }

  onModuleDestroy(): void {
    for (const timer of this.ringTimers.values()) {
      clearTimeout(timer);
    }
    this.ringTimers.clear();
    for (const timer of this.callerDisconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.callerDisconnectTimers.clear();
  }

  @SubscribeMessage(EVoiceRoomEvent.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomJoinDto,
  ) {
    let identity: TVoiceSessionIdentity;
    let roomId: number | undefined;

    if (body.sessionTarget) {
      identity = toVoiceSessionIdentity(body.sessionTarget);
      if (body.sessionTarget.type === EVoiceSessionType.GROUP_ROOM) {
        roomId = body.sessionTarget.roomId;
      } else {
        const call = this.directCallsStateService.get(
          body.sessionTarget.callId,
        );
        if (
          !call ||
          call.status !== 'active' ||
          !this.directCallsStateService.isParticipant(call, socket.data.user.id)
        ) {
          this.logger.warn(
            `Direct call is not available to join: socketId=${socket.id}, callId=${body.sessionTarget.callId}, userId=${socket.data.user.id}`,
          );
          throw AppException.badRequest(
            ApiErrorCode.CALL_NOT_JOINABLE,
            'Direct call is not available to join',
          );
        }
      }
    } else if (body.sessionKey) {
      const parsed = this.voiceRoomsStateService.resolveIdentityFromKey(
        body.sessionKey,
      );
      if (!parsed) {
        this.logger.warn(
          `Invalid session key: socketId=${socket.id}, sessionKey=${String(
            body.sessionKey,
          )
            .slice(0, 64)
            .replace(/[\r\n]/g, ' ')}`,
        );
        throw AppException.badRequest(
          ApiErrorCode.VOICE_SESSION_INVALID,
          'Invalid session key',
        );
      }
      identity = parsed;
      if (parsed.type === EVoiceSessionType.GROUP_ROOM) {
        roomId = parsed.roomId;
      }
    } else if (body.roomId !== undefined) {
      roomId = body.roomId;
      identity = this.voiceRoomsStateService.createGroupIdentity(body.roomId);
    } else {
      this.logger.warn(
        `No room or session provided to join: socketId=${socket.id}, userId=${socket.data.user?.id}`,
      );
      throw AppException.badRequest(
        ApiErrorCode.VOICE_SESSION_INVALID,
        'No room or session provided to join',
      );
    }

    const sessionKey = getVoiceSessionKey(identity);

    this.logger.debug(
      `handleJoinRoom: socketId=${socket.id}, sessionKey=${sessionKey}, roomId=${roomId}, userId=${socket.data.user?.id}`,
    );
    const current = socket.data.user;
    if (!current) {
      throw AppException.unauthorized(
        ApiErrorCode.UNAUTHORIZED,
        'Unauthorized',
      );
    }
    const fresh = await this.authService.getActiveUserById(current.id);
    const user = { ...current, ...fresh };
    socket.data.user = user;

    if (
      !user.isOwner &&
      !user.permissions?.includes(EPermission.CONNECT_VOICE)
    ) {
      throw AppException.forbidden(
        ApiErrorCode.ROOM_ACCESS_DENIED,
        'Permission denied to connect to voice',
      );
    }

    if (roomId !== undefined) {
      await this.roomsFacade.assertCanAccessRoom(user, roomId);
    }

    // Ensure room + register peer before exposing session on the socket.
    // Otherwise concurrent GET_RTP_CAPABILITIES can see sessionKey without a peer
    // (e.g. while createRouter is still awaiting).
    const room = await this.voiceRoomsStateService.ensureRoom(identity);

    const userAlreadyInRoom = this.isUserInRoom(room, user.id);

    // Reconnect can race: new socket joins before the old socket's disconnect
    // is processed. Clients key peers by userId, so a late PEER_LEFT from the
    // old socket would wipe consumers already attached to the new peer.
    this.evictExistingUserPeers(room, socket, sessionKey, roomId, user.id);

    const muted = Boolean(body.muted);
    const deafened = Boolean(body.deafened);

    room.peers.set(socket.id, {
      id: socket.id,
      user,
      producers: new Map(),
      consumers: new Map(),
      muted,
      deafened,
    });

    socket.data.sessionKey = sessionKey;
    socket.data.sessionTarget = identity;
    socket.data.roomId = roomId;

    if (roomId !== undefined && !userAlreadyInRoom) {
      emitVoiceRoomsDomainEvent(
        this.eventEmitter,
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED,
        this.voiceRoomsStateService.createLobbyPeerJoined(
          roomId,
          user,
          muted,
          deafened,
        ),
      );
    }

    const peerJoinedPayload = {
      user,
      roomId,
      sessionKey,
      muted,
      deafened,
    };
    const roomsToEmit = this.getRoomEmitTargets(sessionKey, roomId);
    socket.to(roomsToEmit).emit(EVoiceRoomEvent.PEER_JOINED, peerJoinedPayload);

    socket.join(sessionKey);
    if (roomId !== undefined) {
      socket.join(roomId.toString());
    }

    const peersOnJoin = this.voiceRoomsStateService.getPeersOnJoin(sessionKey);
    socket.emit(EVoiceRoomEvent.PEERS_ON_JOIN, peersOnJoin);

    return {};
  }

  @SubscribeMessage(EVoiceRoomEvent.LEAVE_ROOM)
  handleLeaveRoom(@ConnectedSocket() socket: TSocket) {
    const sessionKey = this.resolveSessionKey(socket);
    const roomId = socket.data.roomId;
    const identity = socket.data.sessionTarget;

    this.logger.debug(
      `handleLeaveRoom: socketId=${socket.id}, sessionKey=${sessionKey}, userId=${socket.data.user?.id}`,
    );

    delete socket.data.sessionKey;
    delete socket.data.sessionTarget;
    delete socket.data.roomId;

    if (sessionKey) {
      const room = this.voiceRoomsStateService.getRoom(sessionKey);
      if (!room) {
        return {};
      }
      const peer = room.peers.get(socket.id);
      if (!peer) {
        return {};
      }

      this.removePeerMedia(room, peer, sessionKey, roomId, socket);
      room.peers.delete(socket.id);

      if (roomId !== undefined && !this.isUserInRoom(room, peer.user.id)) {
        emitVoiceRoomsDomainEvent(
          this.eventEmitter,
          VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT,
          this.voiceRoomsStateService.createLobbyPeerLeft(roomId, peer.user.id),
        );
      }

      if (!room.peers.size) {
        this.voiceRoomsStateService.removeRoom(sessionKey);
        if (identity) {
          this.endDirectCallIfEmpty(sessionKey, identity);
        } else {
          const parsed =
            this.voiceRoomsStateService.resolveIdentityFromKey(sessionKey);
          if (parsed) {
            this.endDirectCallIfEmpty(sessionKey, parsed);
          }
        }
      }

      socket.leave(sessionKey);
      if (roomId !== undefined) {
        socket.leave(roomId.toString());
      }

      const peerLeftPayload = {
        user: socket.data.user,
        roomId,
        sessionKey,
      };
      const roomsToEmit = this.getRoomEmitTargets(sessionKey, roomId);
      socket.to(roomsToEmit).emit(EVoiceRoomEvent.PEER_LEFT, peerLeftPayload);
    }

    return {};
  }

  @SubscribeMessage(EVoiceRoomEvent.GET_ALL_PEERS)
  handleGetAllPeers(): TVoiceRoomGetAllPeersSnapshot {
    return this.voiceRoomsStateService.getLobbySnapshot();
  }

  @SubscribeMessage(EVoiceRoomEvent.GET_RTP_CAPABILITIES)
  async handleGetRtpCapabilities(@ConnectedSocket() socket: TSocket) {
    const { room } = this.getSocketRoomPeer(socket);
    return room.router.rtpCapabilities;
  }

  @SubscribeMessage(EVoiceRoomEvent.CREATE_TRANSPORT)
  async handleCreateTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCreateTransportDto,
  ) {
    const { room, peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `handleCreateTransport: socketId=${socket.id}, sessionKey=${sessionKey}, direction=${body.direction}`,
    );

    const announcedAddresses = await resolveAnnouncedAddresses(
      this.appService.MEDIASOUP_ANNOUNCED_ADDRESSES,
    );
    const transport = await room.router.createWebRtcTransport({
      listenInfos: buildWebRtcListenInfos(announcedAddresses),
    });

    if (body.direction === 'send') {
      peer.sendTransport = transport;
    } else {
      peer.recvTransport = transport;
    }

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    } satisfies TVoiceRoomCreateTransportResult;
  }

  @SubscribeMessage(EVoiceRoomEvent.CONNECT_TRANSPORT)
  async connectTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomConnectTransportDto,
  ) {
    const { peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `connectTransport: socketId=${socket.id}, sessionKey=${sessionKey}, transportId=${body.transportId}`,
    );

    const transport = this.getPeerTransport(peer, body.transportId);

    await transport.connect({
      dtlsParameters: body.dtlsParameters as unknown as DtlsParameters,
    });

    return {};
  }

  @SubscribeMessage(ESocketEvent.PING)
  handlePing(): object {
    return {};
  }

  @SubscribeMessage(EVoiceRoomEvent.SESSION_CHECK)
  handleSessionCheck(
    @ConnectedSocket() socket: TSocket,
  ): TVoiceRoomSessionCheckResult {
    const sessionKey = this.resolveSessionKey(socket);
    const room = sessionKey
      ? this.voiceRoomsStateService.getRoom(sessionKey)
      : undefined;
    return { active: Boolean(room?.peers.has(socket.id)) };
  }

  @SubscribeMessage(EVoiceRoomEvent.RESTART_ICE)
  async handleRestartIce(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomRestartIceDto,
  ): Promise<TVoiceRoomRestartIceResult> {
    const { peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `restartIce: socketId=${socket.id}, sessionKey=${sessionKey}, transportId=${body.transportId}`,
    );
    const transport = this.getPeerTransport(peer, body.transportId);
    const iceParameters = await transport.restartIce();
    return { iceParameters };
  }

  @SubscribeMessage(EVoiceRoomEvent.PRODUCE)
  async produce(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomProduceDto,
  ) {
    const { room, peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `produce: socketId=${socket.id}, sessionKey=${sessionKey}, kind=${body.kind}, mediaTag=${body.mediaTag}`,
    );

    assertKnownMediaTag(body.mediaTag, body.kind);
    assertKindMatchesMediaTag(body.kind, body.mediaTag);

    return room.produceMutex.runExclusive(async () => {
      const transport = peer.sendTransport;
      if (!transport) {
        throw AppException.notFound(
          ApiErrorCode.VOICE_TRANSPORT_NOT_FOUND,
          'Send transport not created',
        );
      }

      const hasScreen = [...peer.producers.values()].some(
        (p) => p.appData.mediaTag === 'screen' && !p.closed,
      );
      assertScreenAudioAllowed(body.mediaTag, hasScreen);

      // Replace existing producer with the same mediaTag (one per tag per peer).
      for (const existing of [...peer.producers.values()]) {
        if (existing.appData.mediaTag === body.mediaTag && !existing.closed) {
          this.closeProducerInternal(
            room,
            peer,
            existing,
            sessionKey,
            socket.data.roomId,
          );
        }
      }

      if (isVideoMediaTag(body.mediaTag)) {
        const videoCount = [...room.producers.values()].filter(
          (p) => !p.closed && p.kind === 'video',
        ).length;
        if (videoCount >= MAX_ROOM_VIDEO_PRODUCERS) {
          throw AppException.badRequest(
            ApiErrorCode.VOICE_VIDEO_LIMIT_REACHED,
            'Room video producer limit reached',
          );
        }
      }

      const producer: Producer<VoiceRoomStateMediasoupAppData> =
        await transport.produce({
          kind: body.kind,
          rtpParameters: body.rtpParameters as unknown as RtpParameters,
          appData: {
            peerId: peer.id,
            mediaTag: body.mediaTag,
          },
        });

      peer.producers.set(producer.id, producer);
      room.producers.set(producer.id, producer);

      const onClosed = () => {
        this.finalizeProducerClosed(
          room,
          peer,
          producer,
          sessionKey,
          socket.data.roomId,
        );
      };
      producer.observer.on('close', onClosed);
      producer.on('transportclose', onClosed);

      const result: TVoiceRoomProduceResult = {
        producerId: producer.id,
        userId: peer.user.id,
        kind: body.kind,
        mediaTag: body.mediaTag,
      };

      const roomsToEmit = this.getRoomEmitTargets(room.id, socket.data.roomId);
      socket.to(roomsToEmit).emit(EVoiceRoomEvent.PRODUCER_CREATED, result);

      return result;
    });
  }

  @SubscribeMessage(EVoiceRoomEvent.CLOSE_PRODUCER)
  async closeProducer(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCloseProducerDto,
  ) {
    const { room, peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `closeProducer: socketId=${socket.id}, sessionKey=${sessionKey}, producerId=${body.producerId}`,
    );

    const producer = peer.producers.get(body.producerId);
    if (!producer || producer.closed) {
      return {};
    }

    this.closeProducerInternal(
      room,
      peer,
      producer,
      sessionKey,
      socket.data.roomId,
    );
    return {};
  }

  @SubscribeMessage(EVoiceRoomEvent.CLOSE_CONSUMER)
  async closeConsumer(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCloseConsumerDto,
  ) {
    const { peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `closeConsumer: socketId=${socket.id}, sessionKey=${sessionKey}, consumerId=${body.consumerId}`,
    );

    const consumer = peer.consumers.get(body.consumerId);
    if (!consumer) {
      return {};
    }

    peer.consumers.delete(consumer.id);
    if (!consumer.closed) {
      consumer.close();
    }
    return {};
  }

  @SubscribeMessage(EVoiceRoomEvent.SET_MUTE_STATE)
  handleSetMuteState(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomSetMuteStateDto,
  ) {
    const { peer, sessionKey } = this.getSocketRoomPeer(socket);
    const muted = Boolean(body?.muted);
    const deafened = Boolean(body?.deafened);

    if (peer.muted === muted && peer.deafened === deafened) {
      return {};
    }

    peer.muted = muted;
    peer.deafened = deafened;

    const payload: TVoiceRoomPeerMuted = {
      userId: peer.user.id,
      muted,
      deafened,
      sessionKey,
      roomId: socket.data.roomId,
    };
    const roomsToEmit = this.getRoomEmitTargets(sessionKey, socket.data.roomId);
    socket.to(roomsToEmit).emit(EVoiceRoomEvent.PEER_MUTE_CHANGED, payload);

    if (socket.data.roomId !== undefined) {
      emitVoiceRoomsDomainEvent(
        this.eventEmitter,
        VoiceRoomsDomainEvents.VOICE_ROOM_PEER_MUTED,
        this.voiceRoomsStateService.createLobbyPeerMuted(
          socket.data.roomId,
          peer.user.id,
          muted,
          deafened,
        ),
      );
    }

    return {};
  }

  @SubscribeMessage(EVoiceRoomEvent.CONSUME)
  async consume(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomConsumeDto,
  ) {
    const { room, peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `consume: socketId=${socket.id}, sessionKey=${sessionKey}, producerId=${body.producerId}`,
    );

    const transport = peer.recvTransport;
    if (!transport) {
      throw AppException.notFound(
        ApiErrorCode.VOICE_TRANSPORT_NOT_FOUND,
        'Receive transport not created',
      );
    }

    const producer = room.producers.get(body.producerId);

    if (!producer) {
      throw AppException.notFound(
        ApiErrorCode.VOICE_PRODUCER_NOT_FOUND,
        'Producer not found',
      );
    }

    if (
      !room.router.canConsume({
        producerId: producer.id,
        rtpCapabilities: body.rtpCapabilities as unknown as RtpCapabilities,
      })
    ) {
      throw AppException.badRequest(
        ApiErrorCode.VOICE_CANNOT_CONSUME,
        'Cannot consume',
      );
    }

    const consumer: Consumer<VoiceRoomStateMediasoupAppData> =
      await transport.consume({
        producerId: producer.id,
        rtpCapabilities: body.rtpCapabilities as unknown as RtpCapabilities,
        appData: {
          peerId: peer.id,
          mediaTag: producer.appData.mediaTag,
        },
      });

    peer.consumers.set(consumer.id, consumer);

    const onConsumerGone = () => {
      if (!peer.consumers.has(consumer.id)) {
        return;
      }
      peer.consumers.delete(consumer.id);
      this.logger.debug(
        `Consumer closed: consumerId=${consumer.id}, peerId=${peer.id}`,
      );
      socket.emit(EVoiceRoomEvent.CONSUMER_CLOSED, {
        consumerId: consumer.id,
      });
    };
    consumer.observer.on('close', onConsumerGone);
    consumer.on('producerclose', onConsumerGone);

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      mediaTag: consumer.appData.mediaTag,
      rtpParameters: consumer.rtpParameters,
    } satisfies TVoiceRoomConsumeResult;
  }

  // --- Direct call signaling ---

  @SubscribeMessage(EDirectCallEvent.CALL_INITIATE)
  handleCallInitiate(
    @ConnectedSocket() client: TSocket,
    @MessageBody() body: CallInitiateDto,
  ) {
    const caller = client.data.user;
    if (!caller) {
      this.logger.warn(`Call initiate without user: socketId=${client.id}`);
      return { error: 'Unauthorized' };
    }

    const call = this.directCallsStateService.create(
      caller.id,
      body.recipientId,
    );

    if (call.status === 'active') {
      this.logger.debug(
        `Call already active: callId=${call.callId}, callerId=${caller.id}, recipientId=${body.recipientId}`,
      );
      return { callId: call.callId, alreadyActive: true };
    }

    this.logger.debug(
      `Call initiated: callId=${call.callId}, callerId=${caller.id}, recipientId=${body.recipientId}`,
    );

    this.server
      .to(body.recipientId.toString())
      .emit(EDirectCallEvent.CALL_INCOMING, {
        callId: call.callId,
        caller,
      });

    emitNotificationsDomainEvent(
      this.eventEmitter,
      NotificationsDomainEvents.DIRECT_CALL,
      {
        recipientId: body.recipientId,
        callerId: caller.id,
        callerUsername: caller.username,
        callId: call.callId,
      },
    );

    if (!this.ringTimers.has(call.callId)) {
      this.startRingTimer(call.callId);
    }

    return { callId: call.callId };
  }

  @SubscribeMessage(EDirectCallEvent.CALL_ACCEPT)
  handleCallAccept(
    @ConnectedSocket() client: TSocket,
    @MessageBody() body: CallAcceptDto,
  ) {
    const recipient = client.data.user;
    if (!recipient) {
      this.logger.warn(
        `Call accept without user: socketId=${client.id}, callId=${body.callId}`,
      );
      return { error: 'Unauthorized' };
    }

    const call = this.directCallsStateService.accept(body.callId, recipient.id);
    if (!call) {
      this.logger.warn(
        `Call accept failed: callId=${body.callId}, userId=${recipient.id}`,
      );
      return { error: 'Call not found or already ended' };
    }

    this.logger.debug(
      `Call accepted: callId=${body.callId}, callerId=${body.callerId}, recipientId=${recipient.id}`,
    );

    this.clearRingTimer(body.callId);
    this.clearCallerDisconnectTimer(body.callId);

    this.server
      .to(body.callerId.toString())
      .emit(EDirectCallEvent.CALL_ACCEPTED, {
        callId: body.callId,
        recipient,
      });

    client
      .to(recipient.id.toString())
      .emit(EDirectCallEvent.CALL_ANSWERED_ELSEWHERE, {
        callId: body.callId,
        outcome: 'accepted',
      });

    return {};
  }

  @SubscribeMessage(EDirectCallEvent.CALL_REJECT)
  handleCallReject(
    @ConnectedSocket() client: TSocket,
    @MessageBody() body: CallRejectDto,
  ) {
    const recipient = client.data.user;
    if (!recipient) {
      this.logger.warn(
        `Call reject without user: socketId=${client.id}, callId=${body.callId}`,
      );
      return { error: 'Unauthorized' };
    }

    const call = this.directCallsStateService.reject(body.callId, recipient.id);
    if (call) {
      this.clearRingTimer(body.callId);
      this.clearCallerDisconnectTimer(body.callId);
      this.logger.debug(
        `Call rejected: callId=${body.callId}, callerId=${body.callerId}, reason=${body.reason ?? 'declined'}`,
      );
      this.server
        .to(body.callerId.toString())
        .emit(EDirectCallEvent.CALL_REJECTED, {
          callId: body.callId,
          reason: body.reason ?? 'declined',
        });
      client
        .to(recipient.id.toString())
        .emit(EDirectCallEvent.CALL_ANSWERED_ELSEWHERE, {
          callId: body.callId,
          outcome: 'rejected',
        });
    }

    return {};
  }

  @SubscribeMessage(EDirectCallEvent.CALL_HANGUP)
  handleCallHangup(
    @ConnectedSocket() _client: TSocket,
    @MessageBody() body: CallHangupDto,
  ) {
    // Hangup only cancels a ringing call. Connected participants use LEAVE_ROOM.
    const existing = this.directCallsStateService.get(body.callId);
    if (!existing || existing.status !== 'ringing') {
      return {};
    }

    const call = this.directCallsStateService.cancel(body.callId);
    if (!call) {
      return {};
    }

    this.clearRingTimer(body.callId);
    this.clearCallerDisconnectTimer(body.callId);

    this.logger.debug(
      `Call hangup: callId=${body.callId}, byUserId=${body.byUserId}`,
    );

    const otherUserId =
      call.callerId === body.byUserId ? call.recipientId : call.callerId;

    this.server.to(otherUserId.toString()).emit(EDirectCallEvent.CALL_HANGUP, {
      callId: body.callId,
      byUserId: body.byUserId,
    });

    return {};
  }

  @SubscribeMessage(EDirectCallEvent.CALL_GET_ACTIVE)
  handleCallGetActive(
    @ConnectedSocket() client: TSocket,
    @MessageBody() body?: CallGetActiveDto,
  ): TCallGetActiveResult | null {
    const user = client.data.user;
    if (!user) {
      return null;
    }

    const call =
      body?.interlocutorId !== undefined
        ? this.directCallsStateService.findActiveBetween(
            user.id,
            body.interlocutorId,
          )
        : this.directCallsStateService.findActiveForUser(user.id);

    if (!call || call.status !== 'active') {
      return null;
    }

    return {
      callId: call.callId,
      callerId: call.callerId,
      recipientId: call.recipientId,
    };
  }
  private resolveSessionKey(socket: TSocket): string | undefined {
    if (socket.data.sessionKey) {
      return socket.data.sessionKey;
    }
    if (socket.data.sessionTarget) {
      return getVoiceSessionKey(socket.data.sessionTarget);
    }
    if (socket.data.roomId !== undefined) {
      return getVoiceSessionKey(
        this.voiceRoomsStateService.createGroupIdentity(socket.data.roomId),
      );
    }
    return undefined;
  }

  private getSessionKey(socket: TSocket): string {
    const sessionKey = this.resolveSessionKey(socket);
    if (!sessionKey) {
      this.logger.warn(
        `Socket without session: socketId=${socket.id}, rooms=${Array.from(socket.rooms)}`,
      );
      throw AppException.badRequest(
        ApiErrorCode.VOICE_SESSION_INVALID,
        'Socket missing session key',
      );
    }
    return sessionKey;
  }

  private throwSocketWithoutRoom(socket: TSocket): void {
    const sessionKey = this.resolveSessionKey(socket);
    if (!sessionKey) {
      this.logger.warn(
        `Socket without session: socketId=${socket.id}, rooms=${Array.from(socket.rooms)}`,
      );
      throw AppException.badRequest(
        ApiErrorCode.VOICE_SESSION_INVALID,
        'Socket missing session key',
      );
    }
    if (!socket.rooms.has(sessionKey)) {
      this.logger.warn(
        `Socket not in session: socketId=${socket.id}, sessionKey=${sessionKey}`,
      );
      throw AppException.badRequest(
        ApiErrorCode.VOICE_SESSION_INVALID,
        'Socket not in session',
      );
    }
  }

  private getPeerTransport(
    peer: { sendTransport?: WebRtcTransport; recvTransport?: WebRtcTransport },
    transportId: string,
  ): WebRtcTransport {
    if (peer.sendTransport?.id === transportId) {
      return peer.sendTransport;
    }
    if (peer.recvTransport?.id === transportId) {
      return peer.recvTransport;
    }
    throw AppException.notFound(
      ApiErrorCode.VOICE_TRANSPORT_NOT_FOUND,
      'Transport not found',
    );
  }

  private getSocketRoomPeer(socket: TSocket) {
    const sessionKey = this.getSessionKey(socket);
    this.throwSocketWithoutRoom(socket);

    const room = this.voiceRoomsStateService.getRoom(sessionKey);
    if (!room) {
      this.logger.warn(
        `Room not found: socketId=${socket.id}, sessionKey=${sessionKey}`,
      );
      throw AppException.notFound(
        ApiErrorCode.ROOM_NOT_FOUND,
        `Room not found for session: ${sessionKey}`,
      );
    }

    const peer = room.peers.get(socket.id);
    if (!peer) {
      this.logger.warn(
        `Peer not registered in room: socketId=${socket.id}, sessionKey=${sessionKey}, roomPeers=${Array.from(room.peers.keys())}`,
      );
      throw AppException.badRequest(
        ApiErrorCode.VOICE_SESSION_INVALID,
        `Socket peer not registered in session: ${sessionKey}`,
      );
    }

    return { room, peer, sessionKey };
  }

  private isUserInRoom(
    room: NonNullable<ReturnType<VoiceRoomsStateService['getRoom']>>,
    userId: number,
  ): boolean {
    for (const peer of room.peers.values()) {
      if (peer.user.id === userId) {
        return true;
      }
    }
    return false;
  }

  private getRoomEmitTargets(sessionKey: string, roomId?: number): string[] {
    const targets = [sessionKey];
    if (roomId !== undefined) {
      targets.push(roomId.toString());
    }
    return targets;
  }

  /**
   * Drop any prior sockets for the same user in this session before registering
   * a new peer. Ensures remote clients see PEER_LEFT before the replacement
   * PEER_JOINED, avoiding wipe of the new consumer graph.
   */
  private evictExistingUserPeers(
    room: NonNullable<ReturnType<VoiceRoomsStateService['getRoom']>>,
    joiningSocket: TSocket,
    sessionKey: string,
    roomId: number | undefined,
    userId: number,
  ): void {
    for (const [existingSocketId, existingPeer] of [...room.peers.entries()]) {
      if (
        existingPeer.user.id !== userId ||
        existingSocketId === joiningSocket.id
      ) {
        continue;
      }

      this.logger.debug(
        `Evicting stale peer on rejoin: sessionKey=${sessionKey}, userId=${userId}, oldSocketId=${existingSocketId}, newSocketId=${joiningSocket.id}`,
      );

      this.removePeerMedia(room, existingPeer, sessionKey, roomId);
      room.peers.delete(existingSocketId);

      const roomsToEmit = this.getRoomEmitTargets(sessionKey, roomId);
      this.server.to(roomsToEmit).emit(EVoiceRoomEvent.PEER_LEFT, {
        user: existingPeer.user,
        roomId,
        sessionKey,
      });

      const oldSocket = this.server.sockets.sockets.get(existingSocketId) as
        TSocket | undefined;
      if (oldSocket) {
        delete oldSocket.data.sessionKey;
        delete oldSocket.data.sessionTarget;
        delete oldSocket.data.roomId;
        void oldSocket.leave(sessionKey);
        if (roomId !== undefined) {
          void oldSocket.leave(roomId.toString());
        }
      }
    }
  }

  private removePeerMedia(
    room: NonNullable<ReturnType<VoiceRoomsStateService['getRoom']>>,
    peer: {
      user: IUserSafe;
      producers: Map<string, Producer<VoiceRoomStateMediasoupAppData>>;
      consumers: Map<string, Consumer<VoiceRoomStateMediasoupAppData>>;
      sendTransport?: WebRtcTransport;
      recvTransport?: WebRtcTransport;
    },
    sessionKey: string,
    roomId: number | undefined,
    /**
     * When provided, PRODUCER_CLOSED is emitted via socket.to (excludes self),
     * matching the historical leave-room fan-out.
     */
    exceptSocket?: TSocket,
  ): void {
    peer.consumers.forEach((c) => c.close());
    for (const producer of [...peer.producers.values()]) {
      this.closeProducerInternal(
        room,
        peer,
        producer,
        sessionKey,
        roomId,
        exceptSocket,
        'peer-left',
      );
    }
    peer.sendTransport?.close?.();
    peer.recvTransport?.close?.();
  }

  /**
   * Close a producer and emit PRODUCER_CLOSED once (idempotent with observer).
   */
  private closeProducerInternal(
    room: NonNullable<ReturnType<VoiceRoomsStateService['getRoom']>>,
    peer: {
      user: IUserSafe;
      producers: Map<string, Producer<VoiceRoomStateMediasoupAppData>>;
    },
    producer: Producer<VoiceRoomStateMediasoupAppData>,
    sessionKey: string,
    roomId: number | undefined,
    exceptSocket?: TSocket,
    reason?: 'peer-left',
  ): void {
    if (producer.appData?.mediaTag === 'screen' && !producer.closed) {
      for (const other of [...peer.producers.values()]) {
        if (
          other.appData?.mediaTag === 'screen-audio' &&
          !other.closed &&
          other.id !== producer.id
        ) {
          this.closeProducerInternal(
            room,
            peer,
            other,
            sessionKey,
            roomId,
            exceptSocket,
            reason,
          );
        }
      }
    }

    this.finalizeProducerClosed(
      room,
      peer,
      producer,
      sessionKey,
      roomId,
      exceptSocket,
      reason,
    );
    if (!producer.closed) {
      producer.close();
    }
  }

  private finalizeProducerClosed(
    room: NonNullable<ReturnType<VoiceRoomsStateService['getRoom']>>,
    peer: {
      user: IUserSafe;
      producers: Map<string, Producer<VoiceRoomStateMediasoupAppData>>;
    },
    producer: Producer<VoiceRoomStateMediasoupAppData>,
    sessionKey: string,
    roomId: number | undefined,
    exceptSocket?: TSocket,
    reason?: 'peer-left',
  ): void {
    const hadPeer = peer.producers.delete(producer.id);
    const hadRoom = room.producers.delete(producer.id);
    if (!hadPeer && !hadRoom) {
      return;
    }

    this.logger.debug(
      `Producer closed: producerId=${producer.id}, userId=${peer.user.id}, sessionKey=${sessionKey}`,
    );

    const payload: TVoiceRoomProducerClosed = {
      producerId: producer.id,
      userId: peer.user.id,
      ...(reason ? { reason } : {}),
    };
    const roomsToEmit = this.getRoomEmitTargets(sessionKey, roomId);
    if (exceptSocket) {
      exceptSocket
        .to(roomsToEmit)
        .emit(EVoiceRoomEvent.PRODUCER_CLOSED, payload);
    } else {
      this.server
        .to(roomsToEmit)
        .emit(EVoiceRoomEvent.PRODUCER_CLOSED, payload);
    }
  }

  private emitCallEnded(
    callId: string,
    callerId: number,
    recipientId: number,
    reason?: 'timeout',
  ) {
    const payload = reason ? { callId, reason } : { callId };
    this.server
      .to(callerId.toString())
      .to(recipientId.toString())
      .emit(EDirectCallEvent.CALL_ENDED, payload);
  }

  private startRingTimer(callId: string): void {
    this.ringTimers.set(
      callId,
      setTimeout(() => this.onRingTimeout(callId), DIRECT_CALL_RING_TIMEOUT_MS),
    );
  }

  private clearRingTimer(callId: string): void {
    const timer = this.ringTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.ringTimers.delete(callId);
    }
  }

  private onRingTimeout(callId: string): void {
    this.ringTimers.delete(callId);
    this.clearCallerDisconnectTimer(callId);
    const call = this.directCallsStateService.get(callId);
    if (!call || call.status !== 'ringing') {
      return;
    }
    this.directCallsStateService.cancel(callId);
    this.emitCallEnded(callId, call.callerId, call.recipientId, 'timeout');
  }

  private scheduleCallerDisconnectCancel(
    callId: string,
    callerId: number,
  ): void {
    if (this.callerDisconnectTimers.has(callId)) {
      return;
    }
    this.callerDisconnectTimers.set(
      callId,
      setTimeout(
        () => void this.onCallerDisconnectGraceElapsed(callId, callerId),
        DIRECT_CALL_CALLER_RECONNECT_GRACE_MS,
      ),
    );
  }

  private clearCallerDisconnectTimer(callId: string): void {
    const timer = this.callerDisconnectTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.callerDisconnectTimers.delete(callId);
    }
  }

  private async onCallerDisconnectGraceElapsed(
    callId: string,
    callerId: number,
  ): Promise<void> {
    this.callerDisconnectTimers.delete(callId);
    const remaining = await this.server.in(callerId.toString()).fetchSockets();
    if (remaining.length > 0) {
      return;
    }
    const call = this.directCallsStateService.get(callId);
    if (!call || call.status !== 'ringing' || call.callerId !== callerId) {
      return;
    }
    this.directCallsStateService.cancel(callId);
    this.clearRingTimer(callId);
    this.server
      .to(call.recipientId.toString())
      .emit(EDirectCallEvent.CALL_HANGUP, {
        callId,
        byUserId: callerId,
      });
  }

  private endDirectCallIfEmpty(
    sessionKey: string,
    identity: TVoiceSessionIdentity,
  ) {
    if (!isDirectCallVoiceSession(identity)) {
      return;
    }
    const room = this.voiceRoomsStateService.getRoom(sessionKey);
    if (room && room.peers.size > 0) {
      return;
    }
    const ended = this.directCallsStateService.end(identity.callId);
    if (ended) {
      this.clearRingTimer(ended.callId);
      this.clearCallerDisconnectTimer(ended.callId);
      this.logger.debug(
        `Call ended: callId=${ended.callId}, callerId=${ended.callerId}, recipientId=${ended.recipientId}`,
      );
      this.emitCallEnded(ended.callId, ended.callerId, ended.recipientId);
    }
  }
}
