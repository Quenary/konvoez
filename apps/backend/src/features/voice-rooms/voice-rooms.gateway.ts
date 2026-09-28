import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Socket, Server, DefaultEventsMap } from 'socket.io';
import {
  type IVoiceRoomConnectTransport,
  type IVoiceRoomConsume,
  type IVoiceRoomConsumeResult,
  type IVoiceRoomCreateTransport,
  type IVoiceRoomCreateTransportResult,
  type TVoiceRoomGetAllPeersResult,
  type IVoiceRoomJoin,
  type IVoiceRoomProduce,
  type IVoiceRoomProduceResult,
  type IUser,
  EVoiceRoomEvent,
  EDirectCallEvent,
  type TVoiceRoomEventMap,
  getVoiceSessionKey,
  EVoiceSessionType,
  toVoiceSessionIdentity,
  type ICallInitiatePayload,
  type ICallAcceptPayload,
  type ICallRejectPayload,
  type ICallHangupPayload,
  type ICallGetActivePayload,
  type ICallGetActiveResult,
  type TVoiceSessionIdentity,
  isDirectCallVoiceSession,
} from '@konvoez/shared';
import { AuthService } from '../auth/auth.service';
import { AppService } from '@shared/services/app.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  VoiceRoomsStateService,
  VoiceRoomStateMediasoupAppData,
} from './voice-rooms.state';
import { DirectCallsStateService } from './direct-calls.state';
import { Consumer, Producer, WebRtcTransport } from 'mediasoup/types';

type TSocket = Socket<
  TVoiceRoomEventMap,
  TVoiceRoomEventMap,
  DefaultEventsMap,
  {
    roomId?: number;
    sessionKey?: string;
    sessionTarget?: TVoiceSessionIdentity;
    user: IUser;
  }
>;

@WebSocketGateway({
  path: '/ws/v1/voice',
  cors: { origin: '*' },
})
export class VoiceRoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(VoiceRoomsGateway.name);

  @WebSocketServer()
  private readonly server!: Server<TVoiceRoomEventMap>;

  constructor(
    private readonly authService: AuthService,
    private readonly appService: AppService,
    private readonly voiceRoomsStateService: VoiceRoomsStateService,
    private readonly directCallsStateService: DirectCallsStateService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        this.logger.warn(
          `Unauthorized voice socket connection attempt: socketId=${client.id}`,
        );
        client.emit(EVoiceRoomEvent.ERROR, {
          message: 'Unauthorized',
        });
        client.disconnect(true);
        return;
      }

      client.data.user = user;
      client.join(user.id.toString());
    } catch (error) {
      this.logger.error(
        `Voice socket auth failed: socketId=${client.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      client.emit(EVoiceRoomEvent.ERROR, {
        message: 'Unauthorized',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(socket: TSocket): void {
    this.handleLeaveRoom(socket);
  }

  @SubscribeMessage(EVoiceRoomEvent.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IVoiceRoomJoin,
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
          throw new Error('Direct call is not available to join');
        }
      }
    } else if (body.sessionKey) {
      const parsed = this.voiceRoomsStateService.resolveIdentityFromKey(
        body.sessionKey,
      );
      if (!parsed) {
        throw new Error('Invalid session key');
      }
      identity = parsed;
      if (parsed.type === EVoiceSessionType.GROUP_ROOM) {
        roomId = parsed.roomId;
      }
    } else if (body.roomId !== undefined) {
      roomId = body.roomId;
      identity = this.voiceRoomsStateService.createGroupIdentity(body.roomId);
    } else {
      throw new Error('No room or session provided to join');
    }

    const sessionKey = getVoiceSessionKey(identity);

    this.logger.debug(
      `handleJoinRoom: socketId=${socket.id}, sessionKey=${sessionKey}, roomId=${roomId}, userId=${socket.data.user?.id}`,
    );
    const user = socket.data.user;

    // Ensure room + register peer before exposing session on the socket.
    // Otherwise concurrent GET_RTP_CAPABILITIES can see sessionKey without a peer
    // (e.g. while createRouter is still awaiting).
    const room = await this.voiceRoomsStateService.ensureRoom(identity);

    // Reconnect can race: new socket joins before the old socket's disconnect
    // is processed. Clients key peers by userId, so a late PEER_LEFT from the
    // old socket would wipe consumers already attached to the new peer.
    this.evictExistingUserPeers(room, socket, sessionKey, roomId, user.id);

    room.peers.set(socket.id, {
      id: socket.id,
      user,
      producers: new Map(),
      consumers: new Map(),
    });

    socket.data.sessionKey = sessionKey;
    socket.data.sessionTarget = identity;
    socket.data.roomId = roomId;

    const peerJoinedPayload = {
      user,
      roomId,
      sessionKey,
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
      `handleLeaveRoom: socketId=${socket.id}, sessionKey=${sessionKey}`,
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
  handleGetAllPeers(): TVoiceRoomGetAllPeersResult {
    return this.voiceRoomsStateService.getAllPeers();
  }

  @SubscribeMessage(EVoiceRoomEvent.GET_RTP_CAPABILITIES)
  async handleGetRtpCapabilities(@ConnectedSocket() socket: TSocket) {
    const { room } = this.getSocketRoomPeer(socket);
    return room.router.rtpCapabilities;
  }

  @SubscribeMessage(EVoiceRoomEvent.CREATE_TRANSPORT)
  async handleCreateTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IVoiceRoomCreateTransport,
  ) {
    const { room, peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `handleCreateTransport: socketId=${socket.id}, sessionKey=${sessionKey}, direction=${body.direction}`,
    );

    const transport = await room.router.createWebRtcTransport({
      listenIps: [
        { ip: '0.0.0.0', announcedIp: this.appService.MEDIASOUP_ANNOUNCED_IP },
      ],
      enableUdp: true,
      enableTcp: true,
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
    } satisfies IVoiceRoomCreateTransportResult;
  }

  @SubscribeMessage(EVoiceRoomEvent.CONNECT_TRANSPORT)
  async connectTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IVoiceRoomConnectTransport,
  ) {
    const { peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `connectTransport: socketId=${socket.id}, sessionKey=${sessionKey}, transportId=${body.transportId}`,
    );

    let transport: WebRtcTransport | undefined;
    if (peer.sendTransport?.id === body.transportId) {
      transport = peer.sendTransport;
    } else if (peer.recvTransport?.id === body.transportId) {
      transport = peer.recvTransport;
    }
    if (!transport) {
      throw new Error('Transport not found');
    }

    await transport.connect({
      dtlsParameters: body.dtlsParameters,
    });

    return {};
  }

  @SubscribeMessage(EVoiceRoomEvent.PRODUCE)
  async produce(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IVoiceRoomProduce,
  ) {
    const { room, peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `produce: socketId=${socket.id}, sessionKey=${sessionKey}, kind=${body.kind}, mediaTag=${body.mediaTag}`,
    );

    const transport = peer.sendTransport;
    if (!transport) {
      throw new Error('Send transport not created');
    }

    const producer: Producer<VoiceRoomStateMediasoupAppData> =
      await transport.produce({
        kind: body.kind,
        rtpParameters: body.rtpParameters,
        appData: {
          peerId: peer.id,
          mediaTag: body.mediaTag,
        },
      });

    peer.producers.set(producer.id, producer);
    room.producers.set(producer.id, producer);

    producer.on('transportclose', () => {
      room.producers.delete(producer.id);
      this.logger.debug(
        `Producer transport closed: producerId=${producer.id}, userId=${peer.user.id}, roomId=${room.id}`,
      );

      const roomsToEmit = this.getRoomEmitTargets(room.id, socket.data.roomId);
      this.server.to(roomsToEmit).emit(EVoiceRoomEvent.PRODUCER_CLOSED, {
        producerId: producer.id,
        userId: peer.user.id,
      });
    });

    const result: IVoiceRoomProduceResult = {
      producerId: producer.id,
      userId: peer.user.id,
      kind: body.kind,
      mediaTag: body.mediaTag,
    };

    const roomsToEmit = this.getRoomEmitTargets(room.id, socket.data.roomId);
    socket.to(roomsToEmit).emit(EVoiceRoomEvent.PRODUCER_CREATED, result);

    return result;
  }

  @SubscribeMessage(EVoiceRoomEvent.CONSUME)
  async consume(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IVoiceRoomConsume,
  ) {
    const { room, peer, sessionKey } = this.getSocketRoomPeer(socket);
    this.logger.debug(
      `consume: socketId=${socket.id}, sessionKey=${sessionKey}, producerId=${body.producerId}`,
    );

    const transport = peer.recvTransport;
    if (!transport) {
      throw new Error('Receive transport not created');
    }

    const producer = room.producers.get(body.producerId);

    if (!producer) {
      throw new Error('Producer not found');
    }

    if (
      !room.router.canConsume({
        producerId: producer.id,
        rtpCapabilities: body.rtpCapabilities,
      })
    ) {
      throw new Error('Cannot consume');
    }

    const consumer: Consumer<VoiceRoomStateMediasoupAppData> =
      await transport.consume({
        producerId: producer.id,
        rtpCapabilities: body.rtpCapabilities,
        appData: {
          peerId: peer.id,
          mediaTag: producer.appData.mediaTag,
        },
      });

    peer.consumers.set(consumer.id, consumer);

    consumer.on('producerclose', () => {
      this.logger.debug(
        `Producer closed, removing consumer: consumerId=${consumer.id}, peerId=${peer.id}`,
      );
      peer.consumers.delete(consumer.id);

      socket.emit(EVoiceRoomEvent.CONSUMER_CLOSED, {
        consumerId: consumer.id,
      });
    });

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      mediaTag: consumer.appData.mediaTag,
      rtpParameters: consumer.rtpParameters,
    } satisfies IVoiceRoomConsumeResult;
  }

  // --- Direct call signaling ---

  @SubscribeMessage(EDirectCallEvent.CALL_INITIATE)
  handleCallInitiate(
    @ConnectedSocket() client: TSocket,
    @MessageBody() body: ICallInitiatePayload,
  ) {
    const caller = client.data.user;
    if (!caller) {
      return { error: 'Unauthorized' };
    }

    const call = this.directCallsStateService.create(
      caller.id,
      body.recipientId,
    );

    if (call.status === 'active') {
      return { callId: call.callId, alreadyActive: true };
    }

    this.server
      .to(body.recipientId.toString())
      .emit(EDirectCallEvent.CALL_INCOMING, {
        callId: call.callId,
        caller,
      });

    void this.notificationsService
      .sendDirectCallNotification(
        body.recipientId,
        caller.id,
        caller.username,
        call.callId,
      )
      .catch(() => {
        // Push notification failure should not block call
      });

    return { callId: call.callId };
  }

  @SubscribeMessage(EDirectCallEvent.CALL_ACCEPT)
  handleCallAccept(
    @ConnectedSocket() client: TSocket,
    @MessageBody() body: ICallAcceptPayload,
  ) {
    const recipient = client.data.user;
    if (!recipient) {
      return { error: 'Unauthorized' };
    }

    const call = this.directCallsStateService.accept(body.callId, recipient.id);
    if (!call) {
      return { error: 'Call not found or already ended' };
    }

    this.server
      .to(body.callerId.toString())
      .emit(EDirectCallEvent.CALL_ACCEPTED, {
        callId: body.callId,
        recipient,
      });

    return {};
  }

  @SubscribeMessage(EDirectCallEvent.CALL_REJECT)
  handleCallReject(
    @ConnectedSocket() _client: TSocket,
    @MessageBody() body: ICallRejectPayload,
  ) {
    const call = this.directCallsStateService.cancel(body.callId);
    if (call) {
      this.server
        .to(body.callerId.toString())
        .emit(EDirectCallEvent.CALL_REJECTED, {
          callId: body.callId,
          reason: body.reason ?? 'declined',
        });
    }

    return {};
  }

  @SubscribeMessage(EDirectCallEvent.CALL_HANGUP)
  handleCallHangup(
    @ConnectedSocket() _client: TSocket,
    @MessageBody() body: ICallHangupPayload,
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
    @MessageBody() body: ICallGetActivePayload,
  ): ICallGetActiveResult | null {
    const user = client.data.user;
    if (!user) {
      return null;
    }

    const call =
      body.interlocutorId !== undefined
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
        `Voice socket without session: socketId=${socket.id}, rooms=${Array.from(socket.rooms)}`,
      );
      throw new Error('Socket missing session key');
    }
    return sessionKey;
  }

  private throwSocketWithoutRoom(socket: TSocket): void {
    const sessionKey = this.resolveSessionKey(socket);
    if (!sessionKey) {
      this.logger.warn(
        `Voice socket without session: socketId=${socket.id}, rooms=${Array.from(socket.rooms)}`,
      );
      throw new Error('Socket missing session key');
    }
    if (!socket.rooms.has(sessionKey)) {
      this.logger.warn(
        `Voice socket not in session: socketId=${socket.id}, sessionKey=${sessionKey}`,
      );
      throw new Error('Socket not in session');
    }
  }

  private getSocketRoomPeer(socket: TSocket) {
    const sessionKey = this.getSessionKey(socket);
    this.throwSocketWithoutRoom(socket);

    const room = this.voiceRoomsStateService.getRoom(sessionKey);
    if (!room) {
      this.logger.warn(
        `Voice room not found: socketId=${socket.id}, sessionKey=${sessionKey}`,
      );
      throw new Error(`Room not found for session: ${sessionKey}`);
    }

    const peer = room.peers.get(socket.id);
    if (!peer) {
      this.logger.warn(
        `Voice peer not registered in room: socketId=${socket.id}, sessionKey=${sessionKey}, roomPeers=${Array.from(room.peers.keys())}`,
      );
      throw new Error(`Socket peer not registered in session: ${sessionKey}`);
    }

    return { room, peer, sessionKey };
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
        `Evicting stale voice peer on rejoin: sessionKey=${sessionKey}, userId=${userId}, oldSocketId=${existingSocketId}, newSocketId=${joiningSocket.id}`,
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
      user: IUser;
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
    peer.producers.forEach((p) => {
      p.close();
      room.producers.delete(p.id);
      const payload = {
        producerId: p.id,
        userId: peer.user.id,
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
    });
    peer.sendTransport?.close?.();
    peer.recvTransport?.close?.();
  }

  private emitCallEnded(callId: string, callerId: number, recipientId: number) {
    const payload = { callId };
    this.server
      .to(callerId.toString())
      .to(recipientId.toString())
      .emit(EDirectCallEvent.CALL_ENDED, payload);
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
      this.emitCallEnded(ended.callId, ended.callerId, ended.recipientId);
    }
  }
}
