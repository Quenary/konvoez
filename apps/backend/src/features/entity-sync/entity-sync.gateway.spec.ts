jest.mock('../auth/auth.service', () => ({
  AuthService: class {},
}));

import { EntitySyncGateway } from './entity-sync.gateway';
import {
  EEntitySyncEvent,
  ERoomType,
  EUserRole,
  type IRoom,
  type IUser,
} from '@konvoez/shared';
import { Server } from 'socket.io';

describe('EntitySyncGateway', () => {
  let gateway: EntitySyncGateway;
  let serverMock: { emit: jest.Mock; to: jest.Mock };
  let authServiceMock: { getUserFromRawCookies: jest.Mock };
  let userPresenceServiceMock: {
    addSocket: jest.Mock;
    removeSocket: jest.Mock;
    isOnline: jest.Mock;
    getOnlineUserIds: jest.Mock;
  };
  let toMock: jest.Mock;

  const user: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice',
    email: 'alice@example.com',
    role: EUserRole.MEMBER,
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
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    gateway = new EntitySyncGateway();
    toMock = jest.fn().mockReturnValue({ emit: jest.fn() });
    serverMock = { emit: jest.fn(), to: toMock };
    authServiceMock = { getUserFromRawCookies: jest.fn() };
    userPresenceServiceMock = {
      addSocket: jest.fn(),
      removeSocket: jest.fn(),
      isOnline: jest.fn(),
      getOnlineUserIds: jest.fn().mockReturnValue([1, 2]),
    };
    Object.assign(gateway, {
      server: serverMock as unknown as Server,
      authService: authServiceMock,
      userPresenceService: userPresenceServiceMock,
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
});
