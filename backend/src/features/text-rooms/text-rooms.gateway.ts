import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { TextRoomsService } from './text-rooms.service';
import { TextRoomCommon } from '@common/text-room';
import * as cookie from 'cookie';
import { ACCESS_TOKEN_KEY } from '../auth/auth.const';
import { MessageDto } from './text-rooms.dto';

@WebSocketGateway({
  path: '/api/text',
  cors: { origin: '*' },
})
export class TextRoomsGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server<TextRoomCommon.TEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

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
      } satisfies TextRoomCommon.IPeer;
    } catch {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage(TextRoomCommon.EEvent.JOIN)
  handleJoin(
    @MessageBody() body: TextRoomCommon.IJoin,
    @ConnectedSocket() client: Socket<TextRoomCommon.TEventMap>,
  ) {
    const currentRoomId = client.data.roomId as number;
    if (currentRoomId) {
      client.leave(currentRoomId.toString());
    }
    if (body.roomId) {
      client.data.roomId = body.roomId;
      client.join(body.roomId.toString());
    }
  }

  @SubscribeMessage(TextRoomCommon.EEvent.LEAVE)
  handleLeave(@ConnectedSocket() client: Socket<TextRoomCommon.TEventMap>) {
    const roomId = client.data.roomId as number;
    client.data.roomId = null;
    if (roomId) {
      client.leave(roomId.toString());
    }
  }

  public onMessageSent(body: MessageDto) {
    const roomId = String(body.roomId ?? body.recipientId);
    return this.server
      .to(roomId)
      .emit(TextRoomCommon.EEvent.MESSAGE_CREATED, body);
  }

  public onMessageEdited(body: MessageDto) {
    const roomId = String(body.roomId ?? body.recipientId);
    return this.server
      .to(roomId)
      .emit(TextRoomCommon.EEvent.MESSAGE_EDITED, body);
  }

  public onMessageDeleted(id: string) {
    return this.server.emit(TextRoomCommon.EEvent.MESSAGE_DELETED, {
      id,
    });
  }
}
