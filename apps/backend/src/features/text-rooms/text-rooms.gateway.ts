import { Inject, Logger, UseFilters, UsePipes } from '@nestjs/common';
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
import { ZodValidationPipe } from 'nestjs-zod';
import { WsAckExceptionFilter } from '@shared/filters/ws-ack-exception.filter';
import { AuthService } from '../auth/auth.service';
import {
  ApiErrorCode,
  ETextRoomEvent,
  type TTextRoomPeer,
  type TTextRoomEventMap,
} from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { toApiErrorResponse } from '@shared/errors/to-api-error';
import { TextRoomJoinDto } from './text-rooms.dto';
import {
  TextRoomDomainEvents,
  type TTextRoomDomainPayloadMap,
} from '@shared/events/text-room.events';

import { RoomsService } from '../rooms/rooms.service';

type TSocket = Socket<
  TTextRoomEventMap,
  TTextRoomEventMap,
  DefaultEventsMap,
  {
    roomId?: number;
    recipientId?: number;
    peer?: TTextRoomPeer;
  }
>;

@UseFilters(WsAckExceptionFilter)
@UsePipes(ZodValidationPipe)
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
  @Inject(RoomsService)
  private readonly roomsService!: RoomsService;
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
        this.emitError(
          client,
          AppException.unauthorized(ApiErrorCode.UNAUTHORIZED, 'Unauthorized'),
        );
        client.disconnect(true);
        return;
      }

      client.data.peer = {
        ...user,
        clientId: client.id,
      } as TTextRoomPeer;

      this.userIdToSocketId.set(user.id, client.id);
      client.join(user.id.toString());
      this.logger.debug(
        `Socket connected: socketId=${client.id}, userId=${user.id}`,
      );
    } catch (error) {
      this.logger.warn(
        `Socket auth failed: socketId=${client.id}, message=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.emitError(client, error);
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
  async handleJoin(
    @MessageBody() body: TextRoomJoinDto,
    @ConnectedSocket() client: TSocket,
  ) {
    this.handleLeave(client);

    const { roomId, recipientId } = body;
    let peer = client.data.peer;
    if (peer) {
      try {
        const freshPeer = await this.authService.getUserFromRawCookies(
          client.handshake.headers.cookie,
        );
        if (freshPeer) {
          peer = {
            ...freshPeer,
            clientId: client.id,
          } as TTextRoomPeer;
          client.data.peer = peer;
        }
      } catch {
        // keep existing peer
      }
    }

    if (!peer) {
      this.logger.warn(`Socket join without peer: socketId=${client.id}`);
      this.emitError(
        client,
        AppException.unauthorized(ApiErrorCode.UNAUTHORIZED, 'Unauthorized'),
      );
      return;
    }

    if (roomId) {
      try {
        const room = await this.roomsService.findOne(roomId);
        if (!this.roomsService.canAccessRoom(peer, room)) {
          this.emitError(
            client,
            AppException.forbidden(
              ApiErrorCode.ROOM_ACCESS_DENIED,
              'Access to room is denied',
            ),
          );
          return;
        }
      } catch (error) {
        this.emitError(client, error);
        return;
      }
      client.data.roomId = roomId;
      client.join(roomId.toString());
    }
    if (recipientId) {
      client.data.recipientId = recipientId;
    }
    client.join(peer.id.toString());
    this.logger.debug(
      `handleJoin: socketId=${client.id}, userId=${peer.id}, roomId=${roomId}, recipientId=${recipientId}`,
    );
  }

  private emitError(client: TSocket, exception: unknown): void {
    const { body } = toApiErrorResponse(exception);
    client.emit(ETextRoomEvent.ERROR, body);
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

  @OnEvent(TextRoomDomainEvents.MESSAGE_REACTION_UPDATED)
  onMessageReactionUpdated(
    body: TTextRoomDomainPayloadMap[typeof TextRoomDomainEvents.MESSAGE_REACTION_UPDATED],
  ) {
    if (body.roomId) {
      this.logger.debug(
        `Fan-out message reaction updated: messageId=${body.messageId}, roomId=${body.roomId}`,
      );
      return this.server
        .to(body.roomId.toString())
        .emit(ETextRoomEvent.MESSAGE_REACTION_UPDATED, body);
    }
    if (body.recipientId && body.senderId) {
      this.logger.debug(
        `Fan-out message reaction updated: messageId=${body.messageId}, recipientId=${body.recipientId}, senderId=${body.senderId}`,
      );
      return this.server
        .to(body.recipientId.toString())
        .to(body.senderId.toString())
        .emit(ETextRoomEvent.MESSAGE_REACTION_UPDATED, body);
    }
    this.logger.warn(
      `Dropped message reaction updated without target: messageId=${body.messageId}`,
    );
  }
}
