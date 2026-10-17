import { Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import {
  EEntitySyncEvent,
  EPermission,
  type IRoom,
  type TEntitySyncEventMap,
} from '@konvoez/shared';
import { AuthService } from '../auth/auth.service';
import { UserPresenceService } from '../users/user-presence.service';
import {
  EntitySyncDomainEvents,
  type TEntitySyncDomainPayloadMap,
} from '@shared/events/entity-sync.events';
import { GetUserDto } from '../users/users.dto';

type TSocket = Socket<
  TEntitySyncEventMap,
  TEntitySyncEventMap,
  DefaultEventsMap,
  { userId?: number; user?: GetUserDto }
>;

@WebSocketGateway({
  path: '/ws/v1/sync',
  cors: { origin: '*' },
})
export class EntitySyncGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server<TEntitySyncEventMap>;

  @Inject(AuthService)
  private readonly authService!: AuthService;

  @Inject(UserPresenceService)
  private readonly userPresenceService!: UserPresenceService;

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

      if (!client.connected) {
        return;
      }

      client.data.userId = user.id;
      client.data.user = user;
      this.userPresenceService.addSocket(user.id, client.id);
      client.emit(EEntitySyncEvent.USER_PRESENCE_SNAPSHOT, {
        userIds: this.userPresenceService.getOnlineUserIds(),
      });
    } catch {
      client.emit(EEntitySyncEvent.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: TSocket) {
    const userId = client.data.userId;
    if (userId != null) {
      this.userPresenceService.removeSocket(userId, client.id);
    }
  }

  private canUserAccessRoom(user: GetUserDto, room: IRoom): boolean {
    if (user.isOwner) return true;
    if (user.permissions?.includes(EPermission.MANAGE_ROOMS)) return true;
    if (!room.isPrivate) return true;
    if (room.allowedUserIds?.includes(user.id)) return true;
    const userRoleIds = user.roles?.map((r) => r.id) ?? [];
    if (room.allowedRoleIds?.some((id) => userRoleIds.includes(id)))
      return true;
    return false;
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
    if (!payload.isPrivate) {
      this.server.emit(EEntitySyncEvent.ROOM_CREATED, payload);
      return;
    }
    for (const [_, client] of this.server.sockets.sockets) {
      if (
        client.data.user &&
        this.canUserAccessRoom(client.data.user, payload)
      ) {
        client.emit(EEntitySyncEvent.ROOM_CREATED, payload);
      }
    }
  }

  @OnEvent(EntitySyncDomainEvents.ROOM_UPDATED)
  onRoomUpdated(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.ROOM_UPDATED],
  ) {
    if (!payload.isPrivate) {
      this.server.emit(EEntitySyncEvent.ROOM_UPDATED, payload);
      return;
    }
    for (const [_, client] of this.server.sockets.sockets) {
      if (client.data.user) {
        if (this.canUserAccessRoom(client.data.user, payload)) {
          client.emit(EEntitySyncEvent.ROOM_UPDATED, payload);
        } else {
          client.emit(EEntitySyncEvent.ROOM_DELETED, { id: payload.id });
        }
      }
    }
  }

  @OnEvent(EntitySyncDomainEvents.ROOM_DELETED)
  onRoomDeleted(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.ROOM_DELETED],
  ) {
    this.server.emit(EEntitySyncEvent.ROOM_DELETED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.VOICE_ROOM_PEER_JOINED)
  onVoiceRoomPeerJoined(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.VOICE_ROOM_PEER_JOINED],
  ) {
    this.server.emit(EEntitySyncEvent.VOICE_ROOM_PEER_JOINED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT)
  onVoiceRoomPeerLeft(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.VOICE_ROOM_PEER_LEFT],
  ) {
    this.server.emit(EEntitySyncEvent.VOICE_ROOM_PEER_LEFT, payload);
  }

  @OnEvent(EntitySyncDomainEvents.VOICE_ROOM_PEER_MUTED)
  onVoiceRoomPeerMuted(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.VOICE_ROOM_PEER_MUTED],
  ) {
    this.server.emit(EEntitySyncEvent.VOICE_ROOM_PEER_MUTED, payload);
  }

  @OnEvent(EntitySyncDomainEvents.USER_PRESENCE_CHANGED)
  onUserPresenceChanged(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.USER_PRESENCE_CHANGED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_PRESENCE_CHANGED, payload);
  }
}
