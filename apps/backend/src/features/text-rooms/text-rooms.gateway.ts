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
import {
  ETextRoomEvent,
  type ITextRoomJoin,
  type ITextRoomMessage,
  ITextRoomPeer,
  TTextRoomEventMap,
} from '@konvoez/shared';

type TSocket = Socket<
  TTextRoomEventMap,
  TTextRoomEventMap,
  DefaultEventsMap,
  {
    roomId?: number;
    recipientId?: number;
    peer?: ITextRoomPeer;
  }
>;

// TODO переделать
// Сообщения должны отправляться всем (кроме создателя), у кого есть доступ

@WebSocketGateway({
  path: '/ws/v1/text',
  cors: { origin: '*' },
})
export class TextRoomsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server<TTextRoomEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

  private readonly userIdToSocketId: Map<number, string> = new Map();

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        client.emit(ETextRoomEvent.ERROR, { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }

      client.data.peer = {
        ...user,
        clientId: client.id,
      } as ITextRoomPeer;

      this.userIdToSocketId.set(user.id, client.id);
      client.join(user.id.toString());
    } catch {
      client.emit(ETextRoomEvent.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: TSocket) {
    const peer = client.data.peer;
    if (peer) {
      this.userIdToSocketId.delete(peer.id);
    }
  }

  @SubscribeMessage(ETextRoomEvent.JOIN)
  handleJoin(
    @MessageBody() body: ITextRoomJoin,
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
    }
    const peer = client.data.peer;
    if (peer) {
      client.join(peer.id.toString());
    }
  }

  @SubscribeMessage(ETextRoomEvent.LEAVE)
  handleLeave(@ConnectedSocket() client: TSocket) {
    const roomId = client.data.roomId;
    delete client.data.roomId;
    delete client.data.recipientId;
    if (roomId) {
      client.leave(roomId.toString());
    }
  }

  public onMessageCreated(body: ITextRoomMessage) {
    if (body.roomId) {
      let res = this.server.to(body.roomId.toString());
      const senderClientId = this.userIdToSocketId.get(body.senderId);
      if (senderClientId) {
        res = res.except(senderClientId);
      }
      return res.emit(ETextRoomEvent.MESSAGE_CREATED, body);
    }
    if (body.recipientId) {
      let res = this.server
        .to(body.recipientId.toString())
        .to(body.senderId.toString());
      const senderClientId = this.userIdToSocketId.get(body.senderId);
      if (senderClientId) {
        res = res.except(senderClientId);
      }
      return res.emit(ETextRoomEvent.MESSAGE_CREATED, body);
    }
  }

  public onMessageUpdated(body: ITextRoomMessage) {
    if (body.roomId) {
      return this.server
        .to(body.roomId.toString())
        .emit(ETextRoomEvent.MESSAGE_EDITED, body);
    }
    if (body.recipientId) {
      return this.server
        .to(body.recipientId.toString())
        .to(body.senderId.toString())
        .emit(ETextRoomEvent.MESSAGE_EDITED, body);
    }
  }

  public onMessageDeleted(id: string) {
    return this.server.emit(ETextRoomEvent.MESSAGE_DELETED, {
      id,
    });
  }
}
