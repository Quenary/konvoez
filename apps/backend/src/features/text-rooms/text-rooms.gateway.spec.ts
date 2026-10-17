jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('../auth/auth.service', () => ({
  AuthService: class {},
}));
jest.mock('../rooms/rooms.service', () => ({
  RoomsService: class {},
}));

import { TextRoomsGateway } from './text-rooms.gateway';
import { ETextRoomEvent, type ITextRoomMessage } from '@konvoez/shared';
import { v7 } from 'uuid';
import { Server, Socket } from 'socket.io';

describe('TextRoomsGateway', () => {
  let gateway: TextRoomsGateway;
  let serverMock: {
    to: jest.Mock;
    except: jest.Mock;
    emit: jest.Mock;
  };
  let roomsServiceMock: {
    findOne: jest.Mock;
    canAccessRoom: jest.Mock;
  };

  beforeEach(() => {
    gateway = new TextRoomsGateway();

    serverMock = {
      to: jest.fn().mockReturnThis(),
      except: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };

    roomsServiceMock = {
      findOne: jest.fn().mockResolvedValue({ id: 42, isPrivate: false }),
      canAccessRoom: jest.fn().mockReturnValue(true),
    };

    Object.assign(gateway, {
      server: serverMock as unknown as Server,
      roomsService: roomsServiceMock,
    });
  });

  it('should join room and peer rooms in handleJoin', async () => {
    const clientMock = {
      data: { peer: { id: 100 } },
      join: jest.fn(),
      leave: jest.fn(),
    } as unknown as Socket;

    await gateway.handleJoin({ roomId: 42, recipientId: null }, clientMock);

    expect(clientMock.join).toHaveBeenCalledWith('42');
    expect(clientMock.join).toHaveBeenCalledWith('100');
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
