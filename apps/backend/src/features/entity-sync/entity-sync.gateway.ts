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
import { UsersService } from '../users/users.service';
import { RoomsFacade } from '../rooms/rooms.facade';

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

  @Inject(UsersService)
  private readonly usersService!: UsersService;

  @Inject(RoomsFacade)
  private readonly roomsFacade!: RoomsFacade;

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
    return this.roomsFacade.canAccessRoom(user, room);
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

  @OnEvent(EntitySyncDomainEvents.USER_PERMISSIONS_CHANGED)
  async onUserPermissionsChanged(
    payload: TEntitySyncDomainPayloadMap[typeof EntitySyncDomainEvents.USER_PERMISSIONS_CHANGED],
  ) {
    const affectedSet =
      payload.userIds.length > 0 ? new Set(payload.userIds) : null;
    const privateRooms = await this.roomsFacade.findPrivateRooms();

    for (const [_, client] of this.server.sockets.sockets) {
      const current = client.data.user;
      if (!current) continue;
      if (affectedSet && !affectedSet.has(current.id)) continue;

      try {
        const previous = current;
        const updated = await this.usersService.findOneAsDto(current.id);
        client.data.user = updated;
        client.emit(EEntitySyncEvent.USER_UPDATED, updated);

        for (const room of privateRooms) {
          const hadAccess = this.canUserAccessRoom(previous, room);
          const hasAccess = this.canUserAccessRoom(updated, room);
          if (!hadAccess && hasAccess) {
            client.emit(EEntitySyncEvent.ROOM_CREATED, room);
          } else if (hadAccess && !hasAccess) {
            client.emit(EEntitySyncEvent.ROOM_DELETED, { id: room.id });
          }
        }
      } catch {
        // user might have been deleted concurrently
      }
    }
  }
}
