import { Inject } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { TextRoomCommon } from '@konvoez/shared';
import { MessageDto } from './text-rooms.dto';

type TSocket = Socket<
  TextRoomCommon.TEventMap,
  TextRoomCommon.TEventMap,
  DefaultEventsMap,
  {
    roomId?: number;
    recipientId?: number;
    peer?: TextRoomCommon.IPeer;
  }
>;

// TODO переделать
// Сообщения должны отправляться всем (кроме создателя), у кого есть доступ

@WebSocketGateway({
  path: '/api/text',
  cors: { origin: '*' },
})
export class TextRoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server<TextRoomCommon.TEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

  private readonly userIdToSocketId: Map<number, string> = new Map();

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        client.emit(TextRoomCommon.EEvent.ERROR, { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }

      client.data.peer = {
        clientId: client.id,
        ...user,
        avatarUrl: 'TODO',
      } satisfies TextRoomCommon.IPeer;

      this.userIdToSocketId.set(user.id, client.id);
    } catch {
      client.emit(TextRoomCommon.EEvent.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: TSocket) {
    const peer = client.data.peer;
    if (peer) {
      this.userIdToSocketId.delete(peer.id);
    }
  }

  @SubscribeMessage(TextRoomCommon.EEvent.JOIN)
  handleJoin(
    @MessageBody() body: TextRoomCommon.IJoin,
    @ConnectedSocket() client: TSocket,
  ) {
    this.handleLeave(client);

    const { roomId, recipientId } = body;
    if (roomId) {
      client.data.roomId = roomId;
      client.join(roomId.toString());
    }
    if (recipientId) {
      client.data.recipientId = recipientId;
      client.join(recipientId.toString());
    }
    const peer = client.data.peer;
    if (peer) {
      client.join(peer.id.toString());
    }
  }

  @SubscribeMessage(TextRoomCommon.EEvent.LEAVE)
  handleLeave(@ConnectedSocket() client: TSocket) {
    const { roomId, recipientId, ...rest } = client.data;
    client.data = rest;
    if (roomId) {
      client.leave(roomId.toString());
    }
    if (recipientId) {
      client.leave(recipientId.toString());
    }
    const peer = client.data.peer;
    if (peer) {
      client.leave(peer.id.toString());
    }
  }

  public onMessageCreated(body: MessageDto) {
    const to = body.roomId || body.recipientId;
    if (to) {
      let res = this.server.to(to.toString());
      const senderClientId = this.userIdToSocketId.get(body.senderId);
      if (senderClientId) {
        res = res.except(senderClientId);
      }
      return res.emit(TextRoomCommon.EEvent.MESSAGE_CREATED, body);
    }
  }

  public onMessageUpdated(body: MessageDto) {
    const to = body.roomId || body.recipientId;
    if (to) {
      return this.server
        .to(to.toString())
        .emit(TextRoomCommon.EEvent.MESSAGE_EDITED, body);
    }
  }

  public onMessageDeleted(id: string) {
    return this.server.emit(TextRoomCommon.EEvent.MESSAGE_DELETED, {
      id,
    });
  }
}
