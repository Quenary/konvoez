import { Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
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
  ITextRoomPeer,
  TTextRoomEventMap,
} from '@konvoez/shared';
import {
  TextRoomDomainEvents,
  type TTextRoomDomainPayloadMap,
} from '@shared/events/text-room.events';

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
  private readonly logger = new Logger(TextRoomsGateway.name);

  private readonly userIdToSocketId: Map<number, string> = new Map();

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        this.logger.warn(
          `Unauthorized socket connection attempt: socketId=${client.id}`,
        );
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
      this.logger.debug(
        `Socket connected: socketId=${client.id}, userId=${user.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Socket auth failed: socketId=${client.id}`,
        error instanceof Error ? error.stack : String(error),
      );
      client.emit(ETextRoomEvent.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: TSocket) {
    const peer = client.data.peer;
    if (peer) {
      this.userIdToSocketId.delete(peer.id);
    }
    this.logger.debug(
      `Socket disconnected: socketId=${client.id}, userId=${peer?.id}`,
    );
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
    } else {
      this.logger.warn(`Socket join without peer: socketId=${client.id}`);
    }
    this.logger.debug(
      `handleJoin: socketId=${client.id}, userId=${peer?.id}, roomId=${roomId}, recipientId=${recipientId}`,
    );
  }

  @SubscribeMessage(ETextRoomEvent.LEAVE)
  handleLeave(@ConnectedSocket() client: TSocket) {
    const roomId = client.data.roomId;
    const recipientId = client.data.recipientId;
    delete client.data.roomId;
    delete client.data.recipientId;
    if (roomId) {
      client.leave(roomId.toString());
    }
    if (roomId || recipientId) {
      this.logger.debug(
        `handleLeave: socketId=${client.id}, userId=${client.data.peer?.id}, roomId=${roomId}, recipientId=${recipientId}`,
      );
    }
  }

  @OnEvent(TextRoomDomainEvents.MESSAGE_CREATED)
  onMessageCreated(
    body: TTextRoomDomainPayloadMap[typeof TextRoomDomainEvents.MESSAGE_CREATED],
  ) {
    if (body.roomId) {
      this.logger.debug(
        `Fan-out message created: messageId=${body.id}, roomId=${body.roomId}, senderId=${body.senderId}`,
      );
      let res = this.server.to(body.roomId.toString());
      const senderClientId = this.userIdToSocketId.get(body.senderId);
      if (senderClientId) {
        res = res.except(senderClientId);
      }
      return res.emit(ETextRoomEvent.MESSAGE_CREATED, body);
    }
    if (body.recipientId) {
      this.logger.debug(
        `Fan-out message created: messageId=${body.id}, recipientId=${body.recipientId}, senderId=${body.senderId}`,
      );
      let res = this.server
        .to(body.recipientId.toString())
        .to(body.senderId.toString());
      const senderClientId = this.userIdToSocketId.get(body.senderId);
      if (senderClientId) {
        res = res.except(senderClientId);
      }
      return res.emit(ETextRoomEvent.MESSAGE_CREATED, body);
    }
    this.logger.warn(
      `Dropped message created without target: messageId=${body.id}, senderId=${body.senderId}`,
    );
  }

  @OnEvent(TextRoomDomainEvents.MESSAGE_UPDATED)
  onMessageUpdated(
    body: TTextRoomDomainPayloadMap[typeof TextRoomDomainEvents.MESSAGE_UPDATED],
  ) {
    if (body.roomId) {
      this.logger.debug(
        `Fan-out message edited: messageId=${body.id}, roomId=${body.roomId}, senderId=${body.senderId}`,
      );
      return this.server
        .to(body.roomId.toString())
        .emit(ETextRoomEvent.MESSAGE_EDITED, body);
    }
    if (body.recipientId) {
      this.logger.debug(
        `Fan-out message edited: messageId=${body.id}, recipientId=${body.recipientId}, senderId=${body.senderId}`,
      );
      return this.server
        .to(body.recipientId.toString())
        .to(body.senderId.toString())
        .emit(ETextRoomEvent.MESSAGE_EDITED, body);
    }
    this.logger.warn(
      `Dropped message edited without target: messageId=${body.id}, senderId=${body.senderId}`,
    );
  }

  @OnEvent(TextRoomDomainEvents.MESSAGE_DELETED)
  onMessageDeleted(
    payload: TTextRoomDomainPayloadMap[typeof TextRoomDomainEvents.MESSAGE_DELETED],
  ) {
    this.logger.debug(`Fan-out message deleted: messageId=${payload.id}`);
    return this.server.emit(ETextRoomEvent.MESSAGE_DELETED, payload);
  }
}
