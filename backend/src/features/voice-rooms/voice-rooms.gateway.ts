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
import { Socket, Server } from 'socket.io';
import { VoiceRoomCommon } from '@common/voice-room';
import { AuthService } from '../auth/auth.service';
import * as cookie from 'cookie';
import { ACCESS_TOKEN_KEY } from '../auth/auth.const';

@WebSocketGateway({
  path: '/api/voice',
  cors: { origin: '*' },
})
export class VoiceRoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server<VoiceRoomCommon.TEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

  @Inject(VoiceRoomsCacheService)
  private readonly voiceRoomsCacheService: VoiceRoomsCacheService;

  private emitExistingPeers(): void {
    this.server.emit(
      VoiceRoomCommon.EEvent.EXISTING_PEERS_ALL,
      this.voiceRoomsCacheService.getAllRoomsWithPeers(),
    );
  }

  async handleConnection(client: Socket) {
    const rawCookies = client.handshake.headers.cookie;
    if (!rawCookies) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }

    const parsedCookies = cookie.parse(rawCookies);
    const accessToken = parsedCookies[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }

    try {
      const user = await this.authService.getUserFromAccessToken(accessToken);
      client.data.peer = {
        clientId: client.id,
        id: user.id,
        username: user.username,
        role: user.role,
      } satisfies VoiceRoomCommon.IPeer;

      this.emitExistingPeers();
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const peer = client.data.peer as VoiceRoomCommon.IPeer;
    const roomId = client.data.roomId;
    client.data.roomId = null;
    this.voiceRoomsCacheService.removePeer(peer);

    if (roomId) {
      this.server.to(roomId.toString()).emit(VoiceRoomCommon.EEvent.PEER_LEFT, {
        peer,
        roomId,
      });

      this.emitExistingPeers();
    }
  }

  @SubscribeMessage(VoiceRoomCommon.EEvent.JOIN_ROOM)
  handleJoin(
    @MessageBody() body: VoiceRoomCommon.IJoinRoom,
    @ConnectedSocket() client: Socket,
  ): void {
    client.data.roomId = body.roomId;
    const peer = client.data.peer as VoiceRoomCommon.IPeer;

    client.join(body.roomId.toString());
    this.voiceRoomsCacheService.addPeer(body.roomId, peer);

    client.to(body.roomId.toString()).emit(VoiceRoomCommon.EEvent.PEER_JOINED, {
      peer,
      roomId: body.roomId,
    });

    let inRoom = this.voiceRoomsCacheService.getRoomWithPeers(body.roomId);
    inRoom = {
      ...inRoom,
      peers: inRoom.peers.filter((p) => p.id !== peer.id),
    };
    client.emit(VoiceRoomCommon.EEvent.EXISTING_PEERS_ON_JOIN, inRoom);

    this.emitExistingPeers();
  }

  @SubscribeMessage(VoiceRoomCommon.EEvent.LEAVE_ROOM)
  handleLeave(@ConnectedSocket() client: Socket): void {
    const peer = client.data.peer as VoiceRoomCommon.IPeer;
    const roomId = client.data.roomId as number;

    if (roomId) {
      client.data.roomId = null;
      this.voiceRoomsCacheService.removePeer(peer);

      client.leave(roomId.toString());

      client.to(roomId.toString()).emit(VoiceRoomCommon.EEvent.PEER_LEFT, {
        peer,
        roomId,
      });

      this.emitExistingPeers();
    }
  }

  @SubscribeMessage(VoiceRoomCommon.EEvent.SIGNAL)
  handleSignal(
    @MessageBody() data: VoiceRoomCommon.ISignal,
    @ConnectedSocket() client: Socket,
  ) {
    if (data.to) {
      this.server.to(data.to).emit(VoiceRoomCommon.EEvent.SIGNAL, {
        from: client.id,
        payload: data.payload,
      });
    }
  }
}
