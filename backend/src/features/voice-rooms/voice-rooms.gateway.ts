import { Inject } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { VoiceRoomsCacheService } from './voice-rooms-cache.service';
import { Socket, Server, DefaultEventsMap } from 'socket.io';
import { VoiceRoomCommon } from '@common/voice-room';
import { AuthService } from '../auth/auth.service';
import { MediasoupService } from './mediasoup.service';
import { AppService } from 'src/shared/services/app.service';
import {
  VoiceRoomsStateService,
  VoiceRoomStateMediasoupAppData,
} from './voice-rooms.state';
import { p } from '@mikro-orm/core';
import { UserCommon } from '@common/user';
import {
  Consumer,
  Producer,
  SctpCapabilities,
  WebRtcTransport,
} from 'mediasoup/types';

type TSocket = Socket<
  VoiceRoomCommon.TEventMap,
  VoiceRoomCommon.TEventMap,
  DefaultEventsMap,
  {
    roomId?: number;
    user: UserCommon.IUser;
  }
>;

@WebSocketGateway({
  path: '/api/voice',
  cors: { origin: '*' },
})
export class VoiceRoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server<VoiceRoomCommon.TEventMap>;

  constructor(
    private readonly authService: AuthService,
    private readonly appService: AppService,
    private readonly voiceRoomsStateService: VoiceRoomsStateService,
  ) {}

  private throwSocketWithoutRoom(socket: TSocket): void {
    if (!socket.data.roomId) {
      throw new Error('Socket missing room id');
    }
    if (!socket.rooms.has(socket.data.roomId.toString())) {
      throw new Error('Socket not in room');
    }
  }

  /**
   * Emit all existing rooms with all existing users to update frontend state
   */
  private emitExistingPeers(): void {
    this.server.emit(
      VoiceRoomCommon.EEvent.EXISTING_PEERS_ALL,
      this.voiceRoomsStateService.getRoomsWithUsers(),
    );
  }

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        client.emit(VoiceRoomCommon.EEvent.ERROR, { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }

      client.data.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        avatar: user.avatar,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      } satisfies UserCommon.IUser;

      this.emitExistingPeers();
    } catch {
      client.emit(VoiceRoomCommon.EEvent.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(socket: TSocket): void {
    this.handleLeaveRoom(socket);
  }

  @SubscribeMessage(VoiceRoomCommon.EEvent.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCommon.IJoinRoom,
  ) {
    const roomId = body.roomId;
    socket.data.roomId = roomId;
    const user = socket.data.user;

    const room = await this.voiceRoomsStateService.ensureRoom(roomId);
    room.peers.set(socket.id, {
      id: socket.id,
      user,
      producers: new Map(),
      consumers: new Map(),
    });

    socket.join(roomId.toString());

    socket.to(roomId.toString()).emit(VoiceRoomCommon.EEvent.PEER_JOINED, {
      user,
      roomId,
    });

    const inRoom = this.voiceRoomsStateService.getRoomWithPeers(roomId);
    socket.emit(VoiceRoomCommon.EEvent.EXISTING_PEERS_ON_JOIN, inRoom);

    this.emitExistingPeers();

    return {};
  }

  @SubscribeMessage(VoiceRoomCommon.EEvent.LEAVE_ROOM)
  handleLeaveRoom(@ConnectedSocket() socket: TSocket) {
    const { roomId, ...rest } = socket.data;
    socket.data = rest;

    if (roomId) {
      const room = this.voiceRoomsStateService.getRoom(roomId);
      if (!room) {
        return;
      }
      const peer = room.peers.get(socket.id);
      if (!peer) {
        return;
      }
      peer.consumers.forEach((c) => c.close());
      peer.producers.forEach((p) => {
        p.close();
        room.producers.delete(p.id);
        socket
          .to(roomId.toString())
          .emit(VoiceRoomCommon.EEvent.PRODUCER_CLOSED, {
            producerId: p.id,
            userId: peer.user.id,
          });
      });
      peer.sendTransport?.close?.();
      peer.recvTransport?.close?.();
      room.peers.delete(socket.id);

      if (!room.peers.size) {
        this.voiceRoomsStateService.removeRoom(roomId);
      }

      socket.leave(roomId.toString());

      socket.to(roomId.toString()).emit(VoiceRoomCommon.EEvent.PEER_LEFT, {
        user: socket.data.user,
        roomId,
      });

      this.emitExistingPeers();
    }

    return {};
  }

  @SubscribeMessage(VoiceRoomCommon.EEvent.GET_RTP_CAPABILITIES)
  async handleGetRtpCapabilities(@ConnectedSocket() socket: TSocket) {
    this.throwSocketWithoutRoom(socket);
    const room = this.voiceRoomsStateService.getRoom(socket.data.roomId!)!;
    return room.router.rtpCapabilities;
  }

  /**
   * Создание транспорта
   * @param socket
   * @param body
   * @returns
   */
  @SubscribeMessage(VoiceRoomCommon.EEvent.CREATE_TRANSPORT)
  async handleCreateTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCommon.ICreateTransport,
  ) {
    this.throwSocketWithoutRoom(socket);
    const room = this.voiceRoomsStateService.getRoom(socket.data.roomId!)!;
    const peer = room.peers.get(socket.id)!;

    const transport = await room.router.createWebRtcTransport({
      listenIps: [
        { ip: '0.0.0.0', announcedIp: this.appService.MEDIASOUP_ANNOUNCED_IP },
      ],
      enableUdp: true,
      enableTcp: true,
      numSctpStreams: body.sctpCapabilities?.numStreams,
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
    } satisfies VoiceRoomCommon.ICreateTransportResult;
  }

  /**
   * Подключение к транспорту
   * @param socket
   * @param body
   */
  @SubscribeMessage(VoiceRoomCommon.EEvent.CONNECT_TRANSPORT)
  async connectTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCommon.IConnectTransport,
  ) {
    this.throwSocketWithoutRoom(socket);
    const room = this.voiceRoomsStateService.getRoom(socket.data.roomId!)!;
    const peer = room.peers.get(socket.id)!;

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
  }

  /**
   * Создание потока отправки
   * @param socket
   * @param body
   * @returns
   */
  @SubscribeMessage(VoiceRoomCommon.EEvent.PRODUCE)
  async produce(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCommon.IProduce,
  ) {
    this.throwSocketWithoutRoom(socket);
    const room = this.voiceRoomsStateService.getRoom(socket.data.roomId!)!;
    const peer = room.peers.get(socket.id)!;
    const transport = peer.sendTransport!;

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

    // Cleanup
    producer.on('transportclose', () => {
      room.producers.delete(producer.id);

      this.server
        .to(room.id.toString())
        .emit(VoiceRoomCommon.EEvent.PRODUCER_CLOSED, {
          producerId: producer.id,
          userId: peer.user.id,
        });
    });

    const result: VoiceRoomCommon.IProduceResult = {
      producerId: producer.id,
      userId: peer.user.id,
      kind: body.kind,
      mediaTag: body.mediaTag,
    };

    socket
      .to(room.id.toString())
      .emit(VoiceRoomCommon.EEvent.PRODUCER_CREATED, result);

    return result;
  }

  /**
   * Создание потока получения
   * @param socket
   * @param body
   * @returns
   */
  @SubscribeMessage(VoiceRoomCommon.EEvent.CONSUME)
  async consume(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: VoiceRoomCommon.IConsume,
  ) {
    this.throwSocketWithoutRoom(socket);
    const room = this.voiceRoomsStateService.getRoom(socket.data.roomId!)!;
    const peer = room.peers.get(socket.id)!;
    const transport = peer.recvTransport!;

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
        paused: true,
      });

    peer.consumers.set(consumer.id, consumer);

    consumer.on('producerclose', () => {
      peer.consumers.delete(consumer.id);

      socket.emit(VoiceRoomCommon.EEvent.CONSUMER_CLOSED, {
        consumerId: consumer.id,
      });
    });

    await consumer.resume();

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      mediaTag: consumer.appData.mediaTag,
      rtpParameters: consumer.rtpParameters,
    } satisfies VoiceRoomCommon.IConsumeResult;
  }
}
