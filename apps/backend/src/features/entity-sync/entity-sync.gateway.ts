import { Inject } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import {
  EEntitySyncEvent,
  ESocketEvent,
  type IRoom,
  type TEntitySyncEventMap,
} from '@konvoez/shared';
import { AuthService } from '../auth/auth.service';
import { UserPresenceService } from '../users/user-presence.service';
import {
  UsersDomainEvents,
  type TUsersDomainPayloadMap,
} from '../users/users.events';
import {
  RoomsDomainEvents,
  type TRoomsDomainPayloadMap,
} from '../rooms/rooms.events';
import {
  VoiceRoomsDomainEvents,
  type TVoiceRoomsDomainPayloadMap,
} from '../voice-rooms/voice-rooms.events';
import {
  RolesDomainEvents,
  type TRolesDomainPayloadMap,
} from '../roles/roles.events';
import { GetUserSafeDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { RoomsFacade } from '../rooms/rooms.facade';

type TSocket = Socket<
  TEntitySyncEventMap,
  TEntitySyncEventMap,
  DefaultEventsMap,
  { userId?: number; user?: GetUserSafeDto }
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

  @SubscribeMessage(ESocketEvent.PING)
  handlePing(): object {
    return {};
  }

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

  @OnEvent(UsersDomainEvents.USER_CREATED)
  onUserCreated(
    payload: TUsersDomainPayloadMap[typeof UsersDomainEvents.USER_CREATED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_CREATED, payload);
  }

  @OnEvent(UsersDomainEvents.USER_UPDATED)
  onUserUpdated(
    payload: TUsersDomainPayloadMap[typeof UsersDomainEvents.USER_UPDATED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_UPDATED, payload);
  }

  @OnEvent(UsersDomainEvents.USER_DELETED)
  onUserDeleted(
    payload: TUsersDomainPayloadMap[typeof UsersDomainEvents.USER_DELETED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_DELETED, payload);
  }

  @OnEvent(RoomsDomainEvents.ROOM_CREATED)
  onRoomCreated(
    payload: TRoomsDomainPayloadMap[typeof RoomsDomainEvents.ROOM_CREATED],
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

  @OnEvent(RoomsDomainEvents.ROOM_UPDATED)
  onRoomUpdated(
    payload: TRoomsDomainPayloadMap[typeof RoomsDomainEvents.ROOM_UPDATED],
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

  @OnEvent(RoomsDomainEvents.ROOM_DELETED)
  onRoomDeleted(
    payload: TRoomsDomainPayloadMap[typeof RoomsDomainEvents.ROOM_DELETED],
  ) {
    this.server.emit(EEntitySyncEvent.ROOM_DELETED, payload);
  }

  @OnEvent(VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED)
  onVoiceRoomPeerJoined(
    payload: TVoiceRoomsDomainPayloadMap[typeof VoiceRoomsDomainEvents.VOICE_ROOM_PEER_JOINED],
  ) {
    this.server.emit(EEntitySyncEvent.VOICE_ROOM_PEER_JOINED, payload);
  }

  @OnEvent(VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT)
  onVoiceRoomPeerLeft(
    payload: TVoiceRoomsDomainPayloadMap[typeof VoiceRoomsDomainEvents.VOICE_ROOM_PEER_LEFT],
  ) {
    this.server.emit(EEntitySyncEvent.VOICE_ROOM_PEER_LEFT, payload);
  }

  @OnEvent(VoiceRoomsDomainEvents.VOICE_ROOM_PEER_MUTED)
  onVoiceRoomPeerMuted(
    payload: TVoiceRoomsDomainPayloadMap[typeof VoiceRoomsDomainEvents.VOICE_ROOM_PEER_MUTED],
  ) {
    this.server.emit(EEntitySyncEvent.VOICE_ROOM_PEER_MUTED, payload);
  }

  @OnEvent(UsersDomainEvents.USER_PRESENCE_CHANGED)
  onUserPresenceChanged(
    payload: TUsersDomainPayloadMap[typeof UsersDomainEvents.USER_PRESENCE_CHANGED],
  ) {
    this.server.emit(EEntitySyncEvent.USER_PRESENCE_CHANGED, payload);
  }

  @OnEvent(RolesDomainEvents.ROLES_CHANGED)
  onRolesChanged() {
    this.server.emit(EEntitySyncEvent.ROLES_CHANGED);
  }

  @OnEvent(RolesDomainEvents.ROLE_PERMISSIONS_CHANGED)
  @OnEvent(UsersDomainEvents.USER_PERMISSIONS_CHANGED)
  async onUserPermissionsChanged(
    payload:
      | TUsersDomainPayloadMap[typeof UsersDomainEvents.USER_PERMISSIONS_CHANGED]
      | TRolesDomainPayloadMap[typeof RolesDomainEvents.ROLE_PERMISSIONS_CHANGED],
  ) {
    const affectedSet =
      payload.userIds.length > 0 ? new Set(payload.userIds) : null;
    const privateRooms = await this.roomsFacade.findPrivateRooms();
    const updatedById = new Map<number, GetUserSafeDto>();

    for (const [_, client] of this.server.sockets.sockets) {
      const current = client.data.user;
      if (!current) continue;
      if (affectedSet && !affectedSet.has(current.id)) continue;

      try {
        const previous = current;
        let updated = updatedById.get(current.id);
        if (!updated) {
          updated = await this.usersService.findOneAsSafeDto(current.id);
          updatedById.set(current.id, updated);
        }
        client.data.user = updated;

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

    if (payload.userIds.length > 0) {
      for (const userId of payload.userIds) {
        if (!updatedById.has(userId)) {
          try {
            const updated = await this.usersService.findOneAsSafeDto(userId);
            updatedById.set(userId, updated);
          } catch {
            // user might have been deleted concurrently
          }
        }
      }
    }

    for (const updated of updatedById.values()) {
      this.server.emit(EEntitySyncEvent.USER_UPDATED, updated);
    }
  }

  @OnEvent(UsersDomainEvents.USER_SESSIONS_REVOKED)
  async onUserSessionsRevoked(
    payload: TUsersDomainPayloadMap[typeof UsersDomainEvents.USER_SESSIONS_REVOKED],
  ): Promise<void> {
    const sockets = await this.server.fetchSockets();
    for (const socket of sockets) {
      if (
        socket.data.user?.id === payload.id ||
        socket.data.userId === payload.id
      ) {
        socket.disconnect(true);
      }
    }
  }

  private canUserAccessRoom(user: GetUserSafeDto, room: IRoom): boolean {
    return this.roomsFacade.canAccessRoom(user, room);
  }
}
