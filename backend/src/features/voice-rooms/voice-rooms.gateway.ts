import { Inject, UnauthorizedException } from '@nestjs/common';
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
import { VoiceChatNS } from '@common/voice-chat';
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
  private readonly server!: Server<VoiceChatNS.TEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

  @Inject(VoiceRoomsCacheService)
  private readonly voiceRoomsCacheService: VoiceRoomsCacheService;

  private emitExistingPeers(): void {
    this.server.emit(
      VoiceChatNS.EEvent.EXISTING_PEERS_ALL,
      Object.entries(this.voiceRoomsCacheService.getAllRooms()).map(
        ([roomId, peers]) => ({ roomId: Number(roomId), peers }),
      ),
    );
  }

  async handleConnection(client: Socket) {
    const rawCookies = client.handshake.headers.cookie;
    if (!rawCookies) {
      throw new UnauthorizedException('Unauthorized');
    }

    const parsedCookies = cookie.parse(rawCookies);
    const accessToken = parsedCookies[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    const user = await this.authService.getUserFromAccessToken(accessToken);
    client.data.peer = {
      clientId: client.id,
      id: user.id,
      username: user.username,
      role: user.role,
    } satisfies VoiceChatNS.IPeer;

    this.emitExistingPeers();
  }

  handleDisconnect(client: Socket): void {
    const peer = client.data.peer as VoiceChatNS.IPeer;
    const roomId = client.data.roomId;
    client.data.roomId = null;
    this.voiceRoomsCacheService.removeUserFromAllRooms(peer);

    if (roomId) {
      this.server.to(roomId.toString()).emit(VoiceChatNS.EEvent.PEER_LEFT, {
        peer,
        roomId,
      });

      this.emitExistingPeers();
    }
  }

  @SubscribeMessage(VoiceChatNS.EEvent.JOIN_ROOM)
  handleJoin(
    @MessageBody() body: VoiceChatNS.IJoinRoom,
    @ConnectedSocket() client: Socket,
  ): void {
    client.data.roomId = body.roomId;
    const peer = client.data.peer as VoiceChatNS.IPeer;

    client.join(body.roomId.toString());
    this.voiceRoomsCacheService.addUserToRoom(body.roomId, peer);

    client.to(body.roomId.toString()).emit(VoiceChatNS.EEvent.PEER_JOINED, {
      peer,
      roomId: body.roomId,
    });

    let inRoom = this.voiceRoomsCacheService.getRoomWithPeers(body.roomId);
    inRoom = {
      ...inRoom,
      peers: inRoom.peers.filter((p) => p.id !== peer.id),
    };
    client.emit(VoiceChatNS.EEvent.EXISTING_PEERS_ON_JOIN, inRoom);

    this.emitExistingPeers();
  }

  @SubscribeMessage(VoiceChatNS.EEvent.LEAVE_ROOM)
  handleLeave(@ConnectedSocket() client: Socket): void {
    const peer = client.data.peer as VoiceChatNS.IPeer;
    const roomId = client.data.roomId as number;

    if (roomId) {
      client.data.roomId = null;
      this.voiceRoomsCacheService.removeUserFromAllRooms(peer);

      client.leave(roomId.toString());

      client.to(roomId.toString()).emit(VoiceChatNS.EEvent.PEER_LEFT, {
        peer,
        roomId,
      });

      this.emitExistingPeers();
    }
  }

  @SubscribeMessage(VoiceChatNS.EEvent.SIGNAL)
  handleSignal(
    @MessageBody() data: VoiceChatNS.ISignal,
    @ConnectedSocket() client: Socket,
  ) {
    if (data.to) {
      this.server.to(data.to).emit(VoiceChatNS.EEvent.SIGNAL, {
        from: client.id,
        payload: data.payload,
      });
    }
  }
}
