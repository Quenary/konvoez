jest.mock('../auth/auth.service', () => ({
  AuthService: class {},
}));

import { EntitySyncGateway } from './entity-sync.gateway';
import {
  EEntitySyncEvent,
  EPermission,
  ERoomType,
  EUserRole,
  type IRoom,
  type IUserSafe,
} from '@konvoez/shared';
import { Server } from 'socket.io';
import { EVENT_LISTENER_METADATA } from '@nestjs/event-emitter/dist/constants';
import { RolesDomainEvents } from '../roles/roles.events';
import { UsersDomainEvents } from '../users/users.events';

describe('EntitySyncGateway', () => {
  let gateway: EntitySyncGateway;
  let serverMock: {
    emit: jest.Mock;
    to: jest.Mock;
    sockets: { sockets: Map<string, unknown> };
  };
  let authServiceMock: { getUserFromRawCookies: jest.Mock };
  let userPresenceServiceMock: {
    addSocket: jest.Mock;
    removeSocket: jest.Mock;
    isOnline: jest.Mock;
    getOnlineUserIds: jest.Mock;
  };
  let toMock: jest.Mock;
  let roomsFacadeMock: {
    findPrivateRooms: jest.Mock;
    canAccessRoom: jest.Mock;
  };

  const user: IUserSafe = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    role: EUserRole.MEMBER,
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const room: IRoom = {
    id: 10,
    name: 'General',
    type: ERoomType.TEXT,
    avatar: null,
    avatarUrl: null,
    author: { id: 1, username: 'alice', fullname: 'Alice' },
    isPrivate: false,
    allowedRoleIds: [],
    allowedUserIds: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    gateway = new EntitySyncGateway();
    toMock = jest.fn().mockReturnValue({ emit: jest.fn() });
    serverMock = {
      emit: jest.fn(),
      to: toMock,
      sockets: { sockets: new Map() },
    };
    authServiceMock = { getUserFromRawCookies: jest.fn() };
    userPresenceServiceMock = {
      addSocket: jest.fn(),
      removeSocket: jest.fn(),
      isOnline: jest.fn(),
      getOnlineUserIds: jest.fn().mockReturnValue([1, 2]),
    };
    const usersServiceMock = {
      findOneAsSafeDto: jest.fn().mockResolvedValue(user),
    };
    roomsFacadeMock = {
      findPrivateRooms: jest.fn().mockResolvedValue([]),
      canAccessRoom: jest.fn().mockImplementation((u, r) => {
        if (u.isOwner) return true;
        if (u.permissions?.includes(EPermission.MANAGE_ROOMS)) return true;
        if (!r.isPrivate) return true;
        if (r.allowedUserIds?.includes(u.id)) return true;
        const userRoleIds =
          u.roles?.map((role: { id: number }) => role.id) ?? [];
        return (
          r.allowedRoleIds?.some((id: number) => userRoleIds.includes(id)) ??
          false
        );
      }),
    };
    Object.assign(gateway, {
      server: serverMock as unknown as Server,
      authService: authServiceMock,
      userPresenceService: userPresenceServiceMock,
      usersService: usersServiceMock,
      roomsFacade: roomsFacadeMock,
    });
  });

  it('should emit USER_CREATED', () => {
    gateway.onUserCreated(user);
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.USER_CREATED,
      user,
    );
  });

  it('should emit USER_UPDATED', () => {
    gateway.onUserUpdated(user);
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.USER_UPDATED,
      user,
    );
  });

  it('should emit USER_DELETED', () => {
    gateway.onUserDeleted({ id: 1 });
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.USER_DELETED,
      { id: 1 },
    );
  });

  it('should emit ROOM_CREATED', () => {
    gateway.onRoomCreated(room);
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.ROOM_CREATED,
      room,
    );
  });

  it('should emit ROOM_UPDATED', () => {
    gateway.onRoomUpdated(room);
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.ROOM_UPDATED,
      room,
    );
  });

  it('should emit ROOM_DELETED', () => {
    gateway.onRoomDeleted({ id: 10 });
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.ROOM_DELETED,
      { id: 10 },
    );
  });

  it('should emit VOICE_ROOM_PEER_JOINED', () => {
    gateway.onVoiceRoomPeerJoined({
      roomId: 3,
      user,
      epoch: 'e1',
      revision: 4,
    });
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.VOICE_ROOM_PEER_JOINED,
      { roomId: 3, user, epoch: 'e1', revision: 4 },
    );
  });

  it('should emit VOICE_ROOM_PEER_LEFT', () => {
    gateway.onVoiceRoomPeerLeft({
      roomId: 3,
      userId: 8,
      epoch: 'e1',
      revision: 5,
    });
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.VOICE_ROOM_PEER_LEFT,
      { roomId: 3, userId: 8, epoch: 'e1', revision: 5 },
    );
  });

  it('should emit VOICE_ROOM_PEER_MUTED', () => {
    gateway.onVoiceRoomPeerMuted({
      roomId: 3,
      userId: 8,
      muted: true,
      deafened: true,
      epoch: 'e1',
      revision: 6,
    });
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.VOICE_ROOM_PEER_MUTED,
      {
        roomId: 3,
        userId: 8,
        muted: true,
        deafened: true,
        epoch: 'e1',
        revision: 6,
      },
    );
  });

  it('should emit USER_PRESENCE_CHANGED', () => {
    gateway.onUserPresenceChanged({ userId: 5, isOnline: true });
    expect(serverMock.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.USER_PRESENCE_CHANGED,
      { userId: 5, isOnline: true },
    );
  });

  it('should authenticate user, store userId, register socket presence, and send snapshot on successful connection', async () => {
    authServiceMock.getUserFromRawCookies.mockResolvedValue(user);
    const client = {
      id: 'socket-client-1',
      connected: true,
      handshake: { headers: { cookie: 'session=123' } },
      data: {} as { userId?: number },
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(
      client as unknown as Parameters<typeof gateway.handleConnection>[0],
    );

    expect(client.data.userId).toBe(user.id);
    expect(userPresenceServiceMock.addSocket).toHaveBeenCalledWith(
      user.id,
      'socket-client-1',
    );
    expect(client.emit).toHaveBeenCalledWith(
      EEntitySyncEvent.USER_PRESENCE_SNAPSHOT,
      { userIds: [1, 2] },
    );
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('should not register presence if socket disconnected while authenticating', async () => {
    authServiceMock.getUserFromRawCookies.mockResolvedValue(user);
    const client = {
      id: 'socket-client-1',
      connected: false,
      handshake: { headers: { cookie: 'session=123' } },
      data: {} as { userId?: number },
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(
      client as unknown as Parameters<typeof gateway.handleConnection>[0],
    );

    expect(client.data.userId).toBeUndefined();
    expect(userPresenceServiceMock.addSocket).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalledWith(
      EEntitySyncEvent.USER_PRESENCE_SNAPSHOT,
      expect.anything(),
    );
  });

  it('should remove socket presence on disconnection', () => {
    const client = {
      id: 'socket-client-1',
      data: { userId: 42 },
    };

    gateway.handleDisconnect(
      client as unknown as Parameters<typeof gateway.handleDisconnect>[0],
    );

    expect(userPresenceServiceMock.removeSocket).toHaveBeenCalledWith(
      42,
      'socket-client-1',
    );
  });

  it('should ignore disconnect when client has no userId', () => {
    const client = {
      id: 'socket-client-1',
      data: {},
    };

    gateway.handleDisconnect(
      client as unknown as Parameters<typeof gateway.handleDisconnect>[0],
    );

    expect(userPresenceServiceMock.removeSocket).not.toHaveBeenCalled();
  });

  it('acknowledges the liveness ping', () => {
    expect(gateway.handlePing()).toEqual({});
  });

  describe('onRolesChanged', () => {
    it('is registered for ROLES_CHANGED event', () => {
      const metadata = Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        EntitySyncGateway.prototype.onRolesChanged,
      );
      const events = metadata.map((m: { event: string }) => m.event);
      expect(events).toContain(RolesDomainEvents.ROLES_CHANGED);
    });

    it('broadcasts ROLES_CHANGED event to all clients', () => {
      gateway.onRolesChanged();
      expect(serverMock.emit).toHaveBeenCalledWith(
        EEntitySyncEvent.ROLES_CHANGED,
      );
    });
  });

  describe('onUserPermissionsChanged', () => {
    it('is registered for both ROLE_PERMISSIONS_CHANGED and USER_PERMISSIONS_CHANGED events', () => {
      const metadata = Reflect.getMetadata(
        EVENT_LISTENER_METADATA,
        EntitySyncGateway.prototype.onUserPermissionsChanged,
      );
      const events = metadata.map((m: { event: string }) => m.event);
      expect(events).toContain(RolesDomainEvents.ROLE_PERMISSIONS_CHANGED);
      expect(events).toContain(UsersDomainEvents.USER_PERMISSIONS_CHANGED);
    });

    it('broadcasts USER_UPDATED to server and emits ROOM_CREATED when user gains access to private room', async () => {
      const clientEmit = jest.fn();
      const clientMock = {
        id: 's-1',
        data: {
          user: {
            ...user,
            id: 5,
            roles: [],
            permissions: [],
          },
        },
        emit: clientEmit,
      };

      serverMock.sockets.sockets.set('s-1', clientMock);

      const privateRoom: IRoom = {
        ...room,
        id: 99,
        isPrivate: true,
        allowedRoleIds: [10],
      };

      const updatedUser: IUserSafe = {
        ...user,
        id: 5,
        roles: [{ id: 10, name: 'VIP', color: null, priority: 1 }],
        permissions: [],
      };

      const usersServiceMock = {
        findOneAsSafeDto: jest.fn().mockResolvedValue(updatedUser),
      };
      Object.assign(gateway, {
        usersService: usersServiceMock,
        roomsFacade: {
          ...roomsFacadeMock,
          findPrivateRooms: jest.fn().mockResolvedValue([privateRoom]),
        },
      });

      await gateway.onUserPermissionsChanged({ userIds: [5] });

      expect(usersServiceMock.findOneAsSafeDto).toHaveBeenCalledWith(5);
      expect(clientMock.data.user).toBe(updatedUser);
      expect(clientEmit).not.toHaveBeenCalledWith(
        EEntitySyncEvent.USER_UPDATED,
        expect.anything(),
      );
      expect(serverMock.emit).toHaveBeenCalledWith(
        EEntitySyncEvent.USER_UPDATED,
        updatedUser,
      );
      // Gained access to privateRoom
      expect(clientEmit).toHaveBeenCalledWith(
        EEntitySyncEvent.ROOM_CREATED,
        privateRoom,
      );
    });

    it('emits ROOM_DELETED when user loses access to private room and broadcasts USER_UPDATED', async () => {
      const clientEmit = jest.fn();
      const clientMock = {
        id: 's-2',
        data: {
          user: {
            ...user,
            id: 7,
            roles: [{ id: 10, name: 'VIP', color: null, priority: 1 }],
            permissions: [],
          },
        },
        emit: clientEmit,
      };

      serverMock.sockets.sockets.set('s-2', clientMock);

      const privateRoom: IRoom = {
        ...room,
        id: 99,
        isPrivate: true,
        allowedRoleIds: [10],
      };

      const revokedUser: IUserSafe = {
        ...user,
        id: 7,
        roles: [],
        permissions: [],
      };

      const usersServiceMock = {
        findOneAsSafeDto: jest.fn().mockResolvedValue(revokedUser),
      };
      Object.assign(gateway, {
        usersService: usersServiceMock,
        roomsFacade: {
          ...roomsFacadeMock,
          findPrivateRooms: jest.fn().mockResolvedValue([privateRoom]),
        },
      });

      await gateway.onUserPermissionsChanged({ userIds: [] }); // all users

      expect(clientEmit).toHaveBeenCalledWith(EEntitySyncEvent.ROOM_DELETED, {
        id: 99,
      });
      expect(serverMock.emit).toHaveBeenCalledWith(
        EEntitySyncEvent.USER_UPDATED,
        revokedUser,
      );
    });

    it('loads and broadcasts user once when user has multiple connected sockets', async () => {
      const client1Emit = jest.fn();
      const client2Emit = jest.fn();
      const client3Emit = jest.fn();

      const user5Original: IUserSafe = {
        ...user,
        id: 5,
        roles: [],
        permissions: [],
      };
      const user7Original: IUserSafe = {
        ...user,
        id: 7,
        roles: [],
        permissions: [],
      };

      const client1 = {
        id: 's-5a',
        data: { user: user5Original },
        emit: client1Emit,
      };
      const client2 = {
        id: 's-5b',
        data: { user: user5Original },
        emit: client2Emit,
      };
      const client3 = {
        id: 's-7',
        data: { user: user7Original },
        emit: client3Emit,
      };

      serverMock.sockets.sockets.set('s-5a', client1);
      serverMock.sockets.sockets.set('s-5b', client2);
      serverMock.sockets.sockets.set('s-7', client3);

      const user5Updated: IUserSafe = {
        ...user5Original,
        permissions: [EPermission.CONNECT_VOICE],
      };
      const usersServiceMock = {
        findOneAsSafeDto: jest.fn().mockResolvedValue(user5Updated),
      };
      Object.assign(gateway, {
        usersService: usersServiceMock,
        roomsFacade: {
          ...roomsFacadeMock,
          findPrivateRooms: jest.fn().mockResolvedValue([]),
        },
      });

      await gateway.onUserPermissionsChanged({ userIds: [5] });

      expect(usersServiceMock.findOneAsSafeDto).toHaveBeenCalledTimes(1);
      expect(usersServiceMock.findOneAsSafeDto).toHaveBeenCalledWith(5);
      expect(serverMock.emit).toHaveBeenCalledTimes(1);
      expect(serverMock.emit).toHaveBeenCalledWith(
        EEntitySyncEvent.USER_UPDATED,
        user5Updated,
      );
      expect(client1.data.user).toBe(user5Updated);
      expect(client2.data.user).toBe(user5Updated);
      expect(client3.data.user).toBe(user7Original);
      expect(client3Emit).not.toHaveBeenCalled();
    });

    it('loads and broadcasts offline affected users in payload.userIds', async () => {
      const user9Updated: IUserSafe = {
        ...user,
        id: 9,
        permissions: [EPermission.MANAGE_ROOMS],
      };
      const usersServiceMock = {
        findOneAsSafeDto: jest.fn().mockResolvedValue(user9Updated),
      };
      Object.assign(gateway, {
        usersService: usersServiceMock,
        roomsFacade: {
          ...roomsFacadeMock,
          findPrivateRooms: jest.fn().mockResolvedValue([]),
        },
      });

      await gateway.onUserPermissionsChanged({ userIds: [9] });

      expect(usersServiceMock.findOneAsSafeDto).toHaveBeenCalledWith(9);
      expect(serverMock.emit).toHaveBeenCalledWith(
        EEntitySyncEvent.USER_UPDATED,
        user9Updated,
      );
    });
  });
});
