jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('../auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('../rooms/rooms.facade', () => ({
  RoomsFacade: class {},
}));

import { TextRoomsGateway } from './text-rooms.gateway';
import {
  ApiErrorCode,
  ETextRoomEvent,
  type ITextRoomMessage,
} from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { v7 } from 'uuid';
import { Server, Socket } from 'socket.io';

describe('TextRoomsGateway', () => {
  let gateway: TextRoomsGateway;
  let serverMock: {
    to: jest.Mock;
    except: jest.Mock;
    emit: jest.Mock;
  };
  let roomsFacadeMock: {
    assertCanAccessRoom: jest.Mock;
  };
  let authServiceMock: {
    getActiveUserById: jest.Mock;
    getUserFromRawCookies: jest.Mock;
  };

  beforeEach(() => {
    gateway = new TextRoomsGateway();

    serverMock = {
      to: jest.fn().mockReturnThis(),
      except: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    roomsFacadeMock = {
      assertCanAccessRoom: jest.fn().mockResolvedValue(undefined),
    };

    authServiceMock = {
      getActiveUserById: jest.fn().mockImplementation((id: number) =>
        Promise.resolve({
          id,
          username: `user_${id}`,
          isOwner: false,
          permissions: [],
          roles: [],
        }),
      ),
      getUserFromRawCookies: jest.fn(),
    };

    Object.assign(gateway, {
      server: serverMock as unknown as Server,
      roomsFacade: roomsFacadeMock,
      authService: authServiceMock,
    });
  });

  it('should join room and peer rooms in handleJoin', async () => {
    const clientMock = {
      data: { peer: { id: 100 } },
      join: jest.fn(),
      leave: jest.fn(),
      handshake: { headers: {} },
    } as unknown as Socket;

    await gateway.handleJoin({ roomId: 42, recipientId: null }, clientMock);

    expect(clientMock.join).toHaveBeenCalledWith('42');
    expect(clientMock.join).toHaveBeenCalledWith('100');
  });

  it('should deny handleJoin without peer and emit UNAUTHORIZED', async () => {
    const emitMock = jest.fn();
    const joinMock = jest.fn();
    const clientMock = {
      data: {},
      join: joinMock,
      leave: jest.fn(),
      emit: emitMock,
      handshake: { headers: {} },
    } as unknown as Socket;

    await gateway.handleJoin({ roomId: 42, recipientId: null }, clientMock);

    expect(joinMock).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith(
      ETextRoomEvent.ERROR,
      expect.objectContaining({
        code: ApiErrorCode.UNAUTHORIZED,
      }),
    );
  });

  it('should emit ROOM_ACCESS_DENIED when user cannot access private room', async () => {
    const emitMock = jest.fn();
    const joinMock = jest.fn();
    const clientMock = {
      data: { peer: { id: 100 } },
      join: joinMock,
      leave: jest.fn(),
      emit: emitMock,
      handshake: { headers: {} },
    } as unknown as Socket;

    roomsFacadeMock.assertCanAccessRoom.mockRejectedValueOnce(
      AppException.forbidden(
        ApiErrorCode.ROOM_ACCESS_DENIED,
        'Access to room is denied',
      ),
    );

    await gateway.handleJoin({ roomId: 42, recipientId: null }, clientMock);

    expect(joinMock).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith(
      ETextRoomEvent.ERROR,
      expect.objectContaining({
        code: ApiErrorCode.ROOM_ACCESS_DENIED,
      }),
    );
  });

  it('should emit ROOM_NOT_FOUND when room does not exist', async () => {
    const emitMock = jest.fn();
    const joinMock = jest.fn();
    const clientMock = {
      data: { peer: { id: 100 } },
      join: joinMock,
      leave: jest.fn(),
      emit: emitMock,
      handshake: { headers: {} },
    } as unknown as Socket;

    roomsFacadeMock.assertCanAccessRoom.mockRejectedValueOnce(
      AppException.notFound(ApiErrorCode.ROOM_NOT_FOUND, 'Room not found'),
    );

    await gateway.handleJoin({ roomId: 999, recipientId: null }, clientMock);

    expect(joinMock).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith(
      ETextRoomEvent.ERROR,
      expect.objectContaining({
        code: ApiErrorCode.ROOM_NOT_FOUND,
      }),
    );
  });

  it('should emit error and not join when getActiveUserById fails', async () => {
    const emitMock = jest.fn();
    const joinMock = jest.fn();
    const clientMock = {
      data: { peer: { id: 100 } },
      join: joinMock,
      leave: jest.fn(),
      emit: emitMock,
      handshake: { headers: {} },
    } as unknown as Socket;

    authServiceMock.getActiveUserById.mockRejectedValueOnce(
      AppException.unauthorized(ApiErrorCode.UNAUTHORIZED, 'User inactive'),
    );

    await gateway.handleJoin({ roomId: 42, recipientId: null }, clientMock);

    expect(joinMock).not.toHaveBeenCalled();
    expect(emitMock).toHaveBeenCalledWith(
      ETextRoomEvent.ERROR,
      expect.objectContaining({
        code: ApiErrorCode.UNAUTHORIZED,
      }),
    );
  });

  it('should reload fresh peer by id and never call getUserFromRawCookies on join', async () => {
    const clientMock = {
      data: { peer: { id: 100, username: 'old_snapshot' } },
      join: jest.fn(),
      leave: jest.fn(),
      handshake: { headers: { cookie: 'stale=cookie' } },
    } as unknown as Socket;

    authServiceMock.getActiveUserById.mockResolvedValueOnce({
      id: 100,
      username: 'fresh_from_db',
      roles: [],
      permissions: [],
      isOwner: false,
    });

    await gateway.handleJoin({ roomId: 42, recipientId: null }, clientMock);

    expect(authServiceMock.getActiveUserById).toHaveBeenCalledWith(100);
    expect(authServiceMock.getUserFromRawCookies).not.toHaveBeenCalled();
    expect(roomsFacadeMock.assertCanAccessRoom).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 100,
        username: 'fresh_from_db',
      }),
      42,
    );
  });

  it('should leave room in handleLeave', () => {
    const clientMock = {
      data: { roomId: 42, recipientId: 2, peer: { id: 100 } },
      join: jest.fn(),
      leave: jest.fn(),
    } as unknown as Socket;

    gateway.handleLeave(clientMock);

    expect(clientMock.leave).toHaveBeenCalledWith('42');
  });

  it('should emit MESSAGE_CREATED to room in onMessageCreated', () => {
    const body: ITextRoomMessage = {
      id: v7(),
      senderId: 1,
      senderUsername: 'alice',
      roomId: 42,
      recipientId: null,
      content: 'hello',
      createdAt: new Date(),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: null,
      replyTo: null,
      reactions: [],
    };

    gateway.onMessageCreated(body);

    expect(serverMock.to).toHaveBeenCalledWith('42');
    expect(serverMock.emit).toHaveBeenCalledWith(
      ETextRoomEvent.MESSAGE_CREATED,
      body,
    );
  });

  it('should emit MESSAGE_CREATED to recipient and sender in onMessageCreated for direct message', () => {
    const body: ITextRoomMessage = {
      id: v7(),
      senderId: 1,
      senderUsername: 'alice',
      roomId: null,
      recipientId: 2,
      content: 'direct hello',
      createdAt: new Date(),
      updatedAt: null,
      isRead: false,
      attachments: [],
      clientId: null,
      replyTo: null,
      reactions: [],
    };

    gateway.onMessageCreated(body);

    expect(serverMock.to).toHaveBeenCalledWith('2');
    expect(serverMock.to).toHaveBeenCalledWith('1');
    expect(serverMock.emit).toHaveBeenCalledWith(
      ETextRoomEvent.MESSAGE_CREATED,
      body,
    );
  });

  it('should emit MESSAGE_EDITED in onMessageUpdated', () => {
    const body: ITextRoomMessage = {
      id: v7(),
      senderId: 1,
      senderUsername: 'alice',
      roomId: 42,
      recipientId: null,
      content: 'hello edited',
      createdAt: new Date(),
      updatedAt: new Date(),
      isRead: false,
      attachments: [],
      clientId: null,
      replyTo: null,
      reactions: [],
    };

    gateway.onMessageUpdated(body);

    expect(serverMock.to).toHaveBeenCalledWith('42');
    expect(serverMock.emit).toHaveBeenCalledWith(
      ETextRoomEvent.MESSAGE_EDITED,
      body,
    );
  });

  it('should emit MESSAGE_EDITED to recipient and sender for direct message', () => {
    const body: ITextRoomMessage = {
      id: v7(),
      senderId: 1,
      senderUsername: 'alice',
      roomId: null,
      recipientId: 2,
      content: 'direct edited',
      createdAt: new Date(),
      updatedAt: new Date(),
      isRead: false,
      attachments: [],
      clientId: null,
      replyTo: null,
      reactions: [],
    };

    gateway.onMessageUpdated(body);

    expect(serverMock.to).toHaveBeenCalledWith('2');
    expect(serverMock.to).toHaveBeenCalledWith('1');
    expect(serverMock.emit).toHaveBeenCalledWith(
      ETextRoomEvent.MESSAGE_EDITED,
      body,
    );
  });

  it('should emit MESSAGE_DELETED in onMessageDeleted', () => {
    const id = v7();

    gateway.onMessageDeleted({ id });

    expect(serverMock.emit).toHaveBeenCalledWith(
      ETextRoomEvent.MESSAGE_DELETED,
      { id },
    );
  });

  it('should emit MESSAGE_REACTION_UPDATED to room in onMessageReactionUpdated', () => {
    const payload = {
      messageId: v7(),
      roomId: 42,
      recipientId: null,
      senderId: 1,
      reactions: [{ emoji: '👍', count: 1, userIds: [1] }],
    };

    gateway.onMessageReactionUpdated(payload);

    expect(serverMock.to).toHaveBeenCalledWith('42');
    expect(serverMock.emit).toHaveBeenCalledWith(
      ETextRoomEvent.MESSAGE_REACTION_UPDATED,
      payload,
    );
  });

  it('should emit MESSAGE_REACTION_UPDATED to recipient and sender in onMessageReactionUpdated', () => {
    const payload = {
      messageId: v7(),
      roomId: null,
      recipientId: 2,
      senderId: 1,
      reactions: [{ emoji: '❤️', count: 1, userIds: [2] }],
    };

    gateway.onMessageReactionUpdated(payload);

    expect(serverMock.to).toHaveBeenCalledWith('2');
    expect(serverMock.to).toHaveBeenCalledWith('1');
    expect(serverMock.emit).toHaveBeenCalledWith(
      ETextRoomEvent.MESSAGE_REACTION_UPDATED,
      payload,
    );
  });
});
