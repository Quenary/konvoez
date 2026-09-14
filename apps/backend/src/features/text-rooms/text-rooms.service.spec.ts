jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
jest.mock('@mikro-orm/core', () => {
  const createProxy = (): unknown =>
    new Proxy(() => createProxy(), {
      get: () => createProxy(),
      apply: () => createProxy(),
    });
  return {
    defineEntity: () => ({
      class: class {},
      setClass: () => undefined,
      addHook: () => undefined,
    }),
    p: createProxy(),
  };
});

import { TextRoomsService } from './text-rooms.service';
import { MessageEntity } from './text-rooms.entity';
import { UsersService } from '../users/users.service';
import { RoomsService } from '../rooms/rooms.service';
import { EncryptionService } from '@shared/services/encryption.service';
import { TextRoomsGateway } from './text-rooms.gateway';
import { EntityRepository, EntityManager } from '@mikro-orm/core';
import { parse, v7, stringify as uuidStringify } from 'uuid';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetUserDto } from '../users/users.dto';
import { RoomEntity } from '../rooms/rooms.entity';
import { EUserRole } from '@konvoez/shared';

describe('TextRoomsService', () => {
  let service: TextRoomsService;
  let messageRepository: jest.Mocked<EntityRepository<MessageEntity>>;
  let usersService: jest.Mocked<UsersService>;
  let roomsService: jest.Mocked<RoomsService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let textRoomsGateway: jest.Mocked<TextRoomsGateway>;
  let em: jest.Mocked<EntityManager>;

  const mockUser: GetUserDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    em = {
      flush: jest.fn().mockResolvedValue(undefined),
      populate: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      remove: jest.fn(),
      getReference: jest.fn().mockReturnValue({ id: 1 }),
    } as unknown as jest.Mocked<EntityManager>;

    messageRepository = {
      getEntityManager: jest.fn().mockReturnValue(em),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      assign: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<MessageEntity>>;

    usersService = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<UsersService>;

    roomsService = {
      findOne: jest.fn(),
    } as unknown as jest.Mocked<RoomsService>;

    encryptionService = {
      encrypt: jest.fn().mockReturnValue({
        encrypted: new Uint8Array([1, 2, 3]),
        iv: new Uint8Array([4, 5, 6]),
        authTag: new Uint8Array([7, 8, 9]),
      }),
      decrypt: jest.fn().mockReturnValue('Decrypted content'),
    } as unknown as jest.Mocked<EncryptionService>;

    textRoomsGateway = {
      onMessageCreated: jest.fn(),
      onMessageUpdated: jest.fn(),
      onMessageDeleted: jest.fn(),
    } as unknown as jest.Mocked<TextRoomsGateway>;

    service = new TextRoomsService(
      messageRepository,
      usersService,
      roomsService,
      encryptionService,
      textRoomsGateway,
    );
  });

  describe('create', () => {
    it('should create a room message successfully', async () => {
      const roomId = 10;
      roomsService.findOne.mockResolvedValue({
        id: roomId,
      } as unknown as RoomEntity);

      const msgId = parse(v7());
      const mockCreated = {
        id: msgId,
        sender: { id: 1, username: 'test_user' },
        room: { id: roomId },
        recipient: null,
        createdAt: new Date(),
        updatedAt: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
      } as unknown as MessageEntity;

      messageRepository.create.mockReturnValue(mockCreated);

      const result = await service.create(mockUser, {
        content: 'Hello World',
        roomId,
        recipientId: null,
      });

      expect(result.content).toBe('Decrypted content');
      expect(result.senderUsername).toBe('test_user');
      expect(result.roomId).toBe(roomId);
      expect(textRoomsGateway.onMessageCreated).toHaveBeenCalledWith(result);
    });

    it('should create a reply message and attach replyTarget', async () => {
      const roomId = 10;
      const targetId = v7();
      const targetEntity = {
        id: parse(targetId),
        sender: { id: 2, username: 'other_user' },
        room: { id: roomId },
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(targetEntity);

      const newMsgId = parse(v7());
      const mockCreated = {
        id: newMsgId,
        sender: { id: 1, username: 'test_user' },
        room: { id: roomId },
        recipient: null,
        replyToId: parse(targetId),
        replyTo: targetEntity,
        createdAt: new Date(),
        updatedAt: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
      } as unknown as MessageEntity;

      messageRepository.create.mockReturnValue(mockCreated);

      const result = await service.create(mockUser, {
        content: 'Reply message',
        roomId,
        recipientId: null,
        replyToId: targetId,
      });

      expect(result.replyTo).toEqual({
        id: uuidStringify(parse(targetId)),
        senderId: 2,
        senderUsername: 'other_user',
        content: 'Decrypted content',
        isDeleted: false,
      });
    });

    it('should throw NotFoundException if reply target message does not exist', async () => {
      messageRepository.findOne.mockResolvedValue(null);

      await expect(
        service.create(mockUser, {
          content: 'Hello',
          roomId: 1,
          recipientId: null,
          replyToId: v7(),
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if reply target is in another room', async () => {
      const targetEntity = {
        id: parse(v7()),
        sender: { id: 2, username: 'other' },
        room: { id: 999 }, // different room
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(targetEntity);

      await expect(
        service.create(mockUser, {
          content: 'Hello',
          roomId: 1,
          recipientId: null,
          replyToId: v7(),
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('list', () => {
    it('should list messages by roomId', async () => {
      const mockItem = {
        id: parse(v7()),
        sender: { id: 1, username: 'user1' },
        room: { id: 10 },
        recipient: null,
        createdAt: new Date(),
        updatedAt: null,
        contentEncrypted: new Uint8Array(),
        iv: new Uint8Array(),
        authTag: new Uint8Array(),
      } as unknown as MessageEntity;

      messageRepository.find.mockResolvedValue([mockItem]);

      const result = await service.list(mockUser, {
        roomId: 10,
        recipientId: null,
        limit: 20,
        beforeId: null,
        afterId: null,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].senderUsername).toBe('user1');
    });

    it('should list messages around a target id', async () => {
      const targetUuid = v7();
      const targetItem = {
        id: parse(targetUuid),
        sender: { id: 2, username: 'target_user' },
        room: { id: 10 },
        recipient: null,
        createdAt: new Date('2026-01-02'),
        updatedAt: null,
        contentEncrypted: new Uint8Array(),
        iv: new Uint8Array(),
        authTag: new Uint8Array(),
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(targetItem);
      messageRepository.find
        .mockResolvedValueOnce([]) // beforeItems
        .mockResolvedValueOnce([]); // afterItems

      const result = await service.list(mockUser, {
        roomId: 10,
        recipientId: null,
        aroundId: targetUuid,
        limit: 25,
        beforeId: null,
        afterId: null,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe(targetUuid);
    });
  });

  describe('updateMessage', () => {
    it('should update message content if sender is author', async () => {
      const msgId = v7();
      const existing = {
        id: parse(msgId),
        sender: { id: mockUser.id, username: mockUser.username },
        contentEncrypted: new Uint8Array(),
        iv: new Uint8Array(),
        authTag: new Uint8Array(),
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(existing);
      messageRepository.assign.mockReturnValue(existing);

      const result = await service.updateMessage(mockUser, msgId, {
        content: 'New content',
      });

      expect(result).toBeDefined();
      expect(textRoomsGateway.onMessageUpdated).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not the sender', async () => {
      const msgId = v7();
      const existing = {
        id: parse(msgId),
        sender: { id: 999, username: 'someone_else' },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(existing);

      await expect(
        service.updateMessage(mockUser, msgId, { content: 'Edit' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('delete', () => {
    it('should delete message and notify gateway', async () => {
      const msgId = v7();
      const existing = {
        id: parse(msgId),
        sender: { id: mockUser.id, username: mockUser.username },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(existing);

      await service.delete(mockUser, msgId);

      expect(em.remove).toHaveBeenCalledWith(existing);
      expect(em.flush).toHaveBeenCalled();
      expect(textRoomsGateway.onMessageDeleted).toHaveBeenCalledWith(msgId);
    });
  });
});
