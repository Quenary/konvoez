import { Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { EEntitySyncEvent, type TEntitySyncEventMap } from '@konvoez/shared';
import { AuthService } from '../auth/auth.service';
import {
  EntitySyncDomainEvents,
  type TEntitySyncDomainPayloadMap,
} from '@shared/events/entity-sync.events';

type TSocket = Socket<
  TEntitySyncEventMap,
  TEntitySyncEventMap,
  DefaultEventsMap,
  { userId?: number }
>;

@WebSocketGateway({
  path: '/ws/v1/sync',
  cors: { origin: '*' },
})
export class EntitySyncGateway implements OnGatewayConnection {
  @WebSocketServer()
  private readonly server!: Server<TEntitySyncEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

  async handleConnection(client: TSocket) {
    try {
      const user = await this.authService.getUserFromRawCookies(
        client.handshake.headers.cookie,
      );

      if (!user) {
        client.emit(EEntitySyncEvent.ERROR, { message: 'Unauthorized' });
        client.disconnect(true);
        return;
      }

      client.data.userId = user.id;
    } catch {
      client.emit(EEntitySyncEvent.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  @OnEvent(EntitySyncDomainEvents.USER_CREATED)
  onUserCreated(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.USER_CREATED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_CREATED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.USER_UPDATED)
  onUserUpdated(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.USER_UPDATED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_UPDATED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.USER_DELETED)
  onUserDeleted(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.USER_DELETED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_DELETED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.ROOM_CREATED)
  onRoomCreated(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.ROOM_CREATED],
  ) {
    this.server.emit(EEntitySyncEvent.ROOM_CREATED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.ROOM_UPDATED)
  onRoomUpdated(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.ROOM_UPDATED],
  ) {
    this.server.emit(EEntitySyncEvent.ROOM_UPDATED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.ROOM_DELETED)
  onRoomDeleted(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.ROOM_DELETED],
  ) {
    this.server.emit(EEntitySyncEvent.ROOM_DELETED, payload);
  }
}
