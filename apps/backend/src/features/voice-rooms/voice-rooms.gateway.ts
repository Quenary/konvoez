import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayDisconnect,
  OnGatewayConnection,
} from '@nestjs/websockets';
import { Socket, Server, DefaultEventsMap } from 'socket.io';
import {
  type IConnectTransport,
  type IConsume,
  type IConsumeResult,
  type ICreateTransport,
  type ICreateTransportResult,
  type IGetAllPeersResult,
  type IJoinRoom,
  type IProduce,
  type IProduceResult,
  type IUser,
  VoiceRoomEvent,
  type VoiceRoomEventMap,
} from '@konvoez/shared';
import { AuthService } from '../auth/auth.service';
import { AppService } from '@shared/services/app.service';
import {
  VoiceRoomsStateService,
  VoiceRoomStateMediasoupAppData,
} from './voice-rooms.state';
import { Consumer, Producer, WebRtcTransport } from 'mediasoup/types';

type TSocket = Socket<
  VoiceRoomEventMap,
  VoiceRoomEventMap,
  DefaultEventsMap,
  {
    roomId?: number;
    user: IUser;
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
  private readonly server!: Server<VoiceRoomEventMap>;

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

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        client.emit(VoiceRoomEvent.ERROR, {
          message: 'Unauthorized',
        });
        client.disconnect(true);
        return;
      }

      client.data.user = user;
    } catch {
      client.emit(VoiceRoomEvent.ERROR, {
        message: 'Unauthorized',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(socket: TSocket): void {
    this.handleLeaveRoom(socket);
  }

  @SubscribeMessage(VoiceRoomEvent.JOIN_ROOM)
  async handleJoinRoom(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IJoinRoom,
  ) {
    console.info('handleJoinRoom', body);
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

    socket.to(roomId.toString()).emit(VoiceRoomEvent.PEER_JOINED, {
      user,
      roomId,
    });

    socket.join(roomId.toString());

    const peersOnJoin = this.voiceRoomsStateService.getPeersOnJoin(roomId);
    socket.emit(VoiceRoomEvent.PEERS_ON_JOIN, peersOnJoin);

    return {};
  }

  @SubscribeMessage(VoiceRoomEvent.LEAVE_ROOM)
  handleLeaveRoom(@ConnectedSocket() socket: TSocket) {
    console.info('handleLeaveRoom', socket.data);
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
        socket.to(roomId.toString()).emit(VoiceRoomEvent.PRODUCER_CLOSED, {
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

      socket.to(roomId.toString()).emit(VoiceRoomEvent.PEER_LEFT, {
        user: socket.data.user,
        roomId,
      });
    }

    return {};
  }

  @SubscribeMessage(VoiceRoomEvent.GET_ALL_PEERS)
  handleGetAllPeers(): IGetAllPeersResult {
    return this.voiceRoomsStateService.getAllPeers();
  }

  @SubscribeMessage(VoiceRoomEvent.GET_RTP_CAPABILITIES)
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
  @SubscribeMessage(VoiceRoomEvent.CREATE_TRANSPORT)
  async handleCreateTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: ICreateTransport,
  ) {
    console.info('handleCreateTransport', body);
    this.throwSocketWithoutRoom(socket);
    const room = this.voiceRoomsStateService.getRoom(socket.data.roomId!)!;
    const peer = room.peers.get(socket.id)!;

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
    } satisfies ICreateTransportResult;
  }

  /**
   * Подключение к транспорту
   * @param socket
   * @param body
   */
  @SubscribeMessage(VoiceRoomEvent.CONNECT_TRANSPORT)
  async connectTransport(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IConnectTransport,
  ) {
    console.info('connectTransport', body);
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

    return {};
  }

  /**
   * Создание потока отправки
   * @param socket
   * @param body
   * @returns
   */
  @SubscribeMessage(VoiceRoomEvent.PRODUCE)
  async produce(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IProduce,
  ) {
    console.info('produce', body);
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

      this.server.to(room.id.toString()).emit(VoiceRoomEvent.PRODUCER_CLOSED, {
        producerId: producer.id,
        userId: peer.user.id,
      });
    });

    const result: IProduceResult = {
      producerId: producer.id,
      userId: peer.user.id,
      kind: body.kind,
      mediaTag: body.mediaTag,
    };

    socket.to(room.id.toString()).emit(VoiceRoomEvent.PRODUCER_CREATED, result);

    return result;
  }

  /**
   * Создание потока получения
   * @param socket
   * @param body
   * @returns
   */
  @SubscribeMessage(VoiceRoomEvent.CONSUME)
  async consume(
    @ConnectedSocket() socket: TSocket,
    @MessageBody() body: IConsume,
  ) {
    console.info('consume', body);
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
      });

    peer.consumers.set(consumer.id, consumer);

    consumer.on('producerclose', () => {
      console.info('Producer closed, remove consumer');
      peer.consumers.delete(consumer.id);

      socket.emit(VoiceRoomEvent.CONSUMER_CLOSED, {
        consumerId: consumer.id,
      });
    });

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      mediaTag: consumer.appData.mediaTag,
      rtpParameters: consumer.rtpParameters,
    } satisfies IConsumeResult;
  }
}
