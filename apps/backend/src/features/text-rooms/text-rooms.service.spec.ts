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
    raw: (sql: string) => sql,
  };
});

import { TextRoomsService } from './text-rooms.service';
import {
  MessageEntity,
  MessageReadEntity,
  MessageSearchTokenEntity,
} from './text-rooms.entity';
import { UsersService } from '../users/users.service';
import { RoomsService } from '../rooms/rooms.service';
import { EncryptionService } from '@shared/services/encryption.service';
import { TextRoomsGateway } from './text-rooms.gateway';
import { EntityRepository, EntityManager } from '@mikro-orm/core';
import { parse, v7, stringify as uuidStringify } from 'uuid';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GetUserDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { RoomEntity } from '../rooms/rooms.entity';
import { EUserRole } from '@konvoez/shared';

describe('TextRoomsService', () => {
  let service: TextRoomsService;
  let messageRepository: jest.Mocked<EntityRepository<MessageEntity>>;
  let messageReadRepository: jest.Mocked<EntityRepository<MessageReadEntity>>;
  let usersService: jest.Mocked<UsersService>;
  let roomsService: jest.Mocked<RoomsService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let textRoomsGateway: jest.Mocked<TextRoomsGateway>;
  let notificationsService: {
    sendDirectMessageNotification: jest.Mock;
  };
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
      getReference: jest.fn().mockImplementation((entityName, id) => ({ id })),
      create: jest.fn().mockImplementation((entityName, data) => data),
      nativeDelete: jest.fn().mockResolvedValue(1),
    } as unknown as jest.Mocked<EntityManager>;

    messageRepository = {
      getEntityManager: jest.fn().mockReturnValue(em),
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      assign: jest.fn(),
      remove: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<MessageEntity>>;

    messageReadRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        toRaw: jest.fn().mockReturnValue('raw-read-subquery'),
      }),
    } as unknown as jest.Mocked<EntityRepository<MessageReadEntity>>;

    usersService = {
      findOne: jest.fn(),
      toDto: jest.fn(),
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
      hashSearchToken: jest.fn().mockReturnValue('hashedToken'),
    } as unknown as jest.Mocked<EncryptionService>;

    textRoomsGateway = {
      onMessageCreated: jest.fn(),
      onMessageUpdated: jest.fn(),
      onMessageDeleted: jest.fn(),
    } as unknown as jest.Mocked<TextRoomsGateway>;

    notificationsService = {
      sendDirectMessageNotification: jest.fn(),
    };

    service = new TextRoomsService(
      messageRepository,
      messageReadRepository,
      usersService,
      roomsService,
      encryptionService,
      textRoomsGateway,
      notificationsService as any,
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
        searchTokens: { add: jest.fn() },
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
      expect(
        notificationsService.sendDirectMessageNotification,
      ).not.toHaveBeenCalled();
    });

    it('should fire-and-forget a push notification for a direct message', async () => {
      usersService.findOne.mockResolvedValue({
        id: 2,
        username: 'other_user',
      } as unknown as UserEntity);

      let resolvePush: (() => void) | undefined;
      notificationsService.sendDirectMessageNotification.mockReturnValue(
        new Promise<void>((resolve) => {
          resolvePush = resolve;
        }),
      );

      const msgId = parse(v7());
      const mockCreated = {
        id: msgId,
        sender: { id: 1, username: 'test_user' },
        room: null,
        recipient: { id: 2 },
        createdAt: new Date(),
        updatedAt: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
        searchTokens: { add: jest.fn() },
      } as unknown as MessageEntity;

      messageRepository.create.mockReturnValue(mockCreated);

      const result = await service.create(mockUser, {
        content: 'Hello',
        roomId: null,
        recipientId: 2,
      });

      expect(result.recipientId).toBe(2);
      expect(
        notificationsService.sendDirectMessageNotification,
      ).toHaveBeenCalledWith(
        2,
        1,
        'test_user',
        'Decrypted content',
        uuidStringify(msgId),
      );
      resolvePush?.();
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
        searchTokens: { add: jest.fn() },
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

    it('should generate and associate search token entities when creating message', async () => {
      const roomId = 10;
      roomsService.findOne.mockResolvedValue({
        id: roomId,
      } as unknown as RoomEntity);

      const searchTokensAdd = jest.fn();
      const mockCreated = {
        id: parse(v7()),
        sender: { id: 1, username: 'test_user' },
        room: { id: roomId },
        recipient: null,
        createdAt: new Date(),
        updatedAt: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
        searchTokens: { add: searchTokensAdd },
      } as unknown as MessageEntity;

      messageRepository.create.mockReturnValue(mockCreated);

      await service.create(mockUser, {
        content: '<p>Searchable message</p>',
        roomId,
        recipientId: null,
      });

      expect(encryptionService.hashSearchToken).toHaveBeenCalled();
      expect(em.create).toHaveBeenCalledWith(
        MessageSearchTokenEntity,
        expect.objectContaining({
          tokenHash: 'hashedToken',
          message: mockCreated,
        }),
      );
      expect(searchTokensAdd).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
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
      expect(result.items[0].isRead).toBe(false);
      expect(messageReadRepository.find).toHaveBeenCalled();
    });

    it('should mark own message as read when another user has a read record', async () => {
      const msgId = parse(v7());
      const mockItem = {
        id: msgId,
        sender: { id: mockUser.id, username: mockUser.username },
        room: { id: 10 },
        recipient: null,
        createdAt: new Date(),
        updatedAt: null,
        contentEncrypted: new Uint8Array(),
        iv: new Uint8Array(),
        authTag: new Uint8Array(),
      } as unknown as MessageEntity;

      messageRepository.find.mockResolvedValue([mockItem]);
      messageReadRepository.find.mockResolvedValue([
        {
          message: { id: msgId },
          reader: { id: 2 },
        } as unknown as MessageReadEntity,
      ]);

      const result = await service.list(mockUser, {
        roomId: 10,
        recipientId: null,
        limit: 20,
        beforeId: null,
        afterId: null,
      });

      expect(result.items[0].isRead).toBe(true);
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

    it('should filter messages by search tokens when search parameter is provided', async () => {
      messageRepository.find.mockResolvedValue([]);

      await service.list(mockUser, {
        roomId: 10,
        recipientId: null,
        search: 'keyword',
        limit: 20,
        beforeId: null,
        afterId: null,
      });

      expect(encryptionService.hashSearchToken).toHaveBeenCalled();
      expect(messageRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          room: 10,
          $and: expect.arrayContaining([
            expect.objectContaining({
              searchTokens: {
                tokenHash: 'hashedToken',
              },
            }),
          ]),
        }),
        expect.anything(),
      );
    });

    it('should not add search filter if query produces no trigrams', async () => {
      messageRepository.find.mockResolvedValue([]);

      await service.list(mockUser, {
        roomId: 10,
        recipientId: null,
        search: 'hi',
        limit: 20,
        beforeId: null,
        afterId: null,
      });

      expect(messageRepository.find).toHaveBeenCalledWith(
        expect.not.objectContaining({
          $and: expect.anything(),
        }),
        expect.anything(),
      );
    });

    it('should list messages by recipientId for direct messages', async () => {
      messageRepository.find.mockResolvedValue([]);

      await service.list(mockUser, {
        roomId: null,
        recipientId: 2,
        limit: 20,
        beforeId: null,
        afterId: null,
      });

      expect(messageRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $or: [
            { sender: mockUser.id, recipient: 2 },
            { sender: 2, recipient: mockUser.id },
          ],
        }),
        expect.anything(),
      );
    });

    it('should throw an Error if neither roomId nor recipientId is provided', async () => {
      await expect(
        service.list(mockUser, {
          roomId: null,
          recipientId: null,
          limit: 20,
          beforeId: null,
          afterId: null,
        }),
      ).rejects.toThrow('Either recipientId or chatRoomId must be provided');
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
        searchTokens: { add: jest.fn() },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(existing);
      messageRepository.assign.mockReturnValue(existing);

      const result = await service.updateMessage(mockUser, msgId, {
        content: 'New content',
      });

      expect(result).toBeDefined();
      expect(textRoomsGateway.onMessageUpdated).toHaveBeenCalled();
    });

    it('should delete existing search tokens and index new tokens on update', async () => {
      const msgId = v7();
      const searchTokensAdd = jest.fn();
      const existing = {
        id: parse(msgId),
        sender: { id: mockUser.id, username: mockUser.username },
        contentEncrypted: new Uint8Array(),
        iv: new Uint8Array(),
        authTag: new Uint8Array(),
        searchTokens: { add: searchTokensAdd },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(existing);
      messageRepository.assign.mockReturnValue(existing);

      await service.updateMessage(mockUser, msgId, {
        content: 'Updated searchable content',
      });

      expect(em.nativeDelete).toHaveBeenCalledWith(MessageSearchTokenEntity, {
        message: existing.id,
      });
      expect(encryptionService.hashSearchToken).toHaveBeenCalled();
      expect(searchTokensAdd).toHaveBeenCalled();
      expect(em.persist).toHaveBeenCalledWith(existing);
      expect(em.flush).toHaveBeenCalled();
    });

    it('should throw NotFoundException when updating non-existent message', async () => {
      messageRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateMessage(mockUser, v7(), { content: 'Update' }),
      ).rejects.toThrow(NotFoundException);
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

    it('should throw NotFoundException when deleting non-existent message', async () => {
      messageRepository.findOne.mockResolvedValue(null);

      await expect(service.delete(mockUser, v7())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when deleting another user message', async () => {
      const msgId = v7();
      const existing = {
        id: parse(msgId),
        sender: { id: 999, username: 'another_user' },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(existing);

      await expect(service.delete(mockUser, msgId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getDirectChats', () => {
    it('should return unique interlocutors sorted by latest message', async () => {
      const user2 = { id: 2, username: 'user2' } as unknown as UserEntity;
      const user3 = { id: 3, username: 'user3' } as unknown as UserEntity;
      const messages = [
        {
          sender: mockUser,
          recipient: user2,
          createdAt: new Date('2026-01-02'),
        },
        {
          sender: user3,
          recipient: mockUser,
          createdAt: new Date('2026-01-01'),
        },
        {
          sender: user2,
          recipient: mockUser,
          createdAt: new Date('2025-12-31'),
        },
      ] as unknown as MessageEntity[];

      messageRepository.find.mockResolvedValue(messages);
      usersService.toDto.mockImplementation(
        (u) =>
          ({
            id: u.id,
            username: u.username,
          }) as unknown as GetUserDto,
      );

      const result = await service.getDirectChats(mockUser);

      expect(messageRepository.find).toHaveBeenCalledWith(
        {
          room: null,
          $or: [
            { sender: mockUser.id, recipient: { $ne: null } },
            { recipient: mockUser.id },
          ],
        },
        {
          fields: ['sender', 'recipient', 'createdAt'],
          orderBy: { createdAt: 'DESC' },
          populate: ['sender', 'recipient'],
        },
      );
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(2);
      expect(result[1].id).toBe(3);
    });
  });

  describe('getUnreadCounts', () => {
    const mockQueryBuilder = (rows: unknown[]) => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(rows),
    });

    it('should aggregate unread room and direct counts', async () => {
      const roomQb = mockQueryBuilder([{ roomId: 10, count: '2' }]);
      const directQb = mockQueryBuilder([{ senderId: 5, count: '3' }]);
      (
        messageRepository as unknown as { createQueryBuilder: jest.Mock }
      ).createQueryBuilder
        .mockReturnValueOnce(roomQb)
        .mockReturnValueOnce(directQb);

      const result = await service.getUnreadCounts(mockUser);

      expect(result).toEqual({
        rooms: { '10': 2 },
        direct: { '5': 3 },
        directTotal: 3,
      });
      expect(roomQb.where).toHaveBeenCalledWith(
        expect.objectContaining({
          id: { $nin: 'raw-read-subquery' },
        }),
      );
    });
  });

  describe('markRead', () => {
    it('should ignore an empty message set', async () => {
      messageRepository.find.mockResolvedValue([]);

      await service.markRead(mockUser, { messageIds: [v7()] });

      expect(messageReadRepository.find).not.toHaveBeenCalled();
      expect(em.flush).not.toHaveBeenCalled();
      expect(textRoomsGateway.onMessageUpdated).not.toHaveBeenCalled();
    });

    it('should skip the sender own messages and persist reads for others', async () => {
      const ownId = parse(v7());
      const otherId = parse(v7());
      const ownMessage = {
        id: ownId,
        sender: { id: mockUser.id, username: mockUser.username },
        room: { id: 10 },
        recipient: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
      } as unknown as MessageEntity;
      const otherMessage = {
        id: otherId,
        sender: { id: 2, username: 'bob' },
        room: { id: 10 },
        recipient: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
      } as unknown as MessageEntity;

      messageRepository.find.mockResolvedValue([ownMessage, otherMessage]);
      messageReadRepository.find.mockResolvedValue([]);

      await service.markRead(mockUser, {
        messageIds: [uuidStringify(ownId), uuidStringify(otherId)],
      });

      expect(messageReadRepository.create).toHaveBeenCalledTimes(1);
      expect(messageReadRepository.create).toHaveBeenCalledWith({
        message: otherMessage,
        reader: { id: mockUser.id },
      });
      expect(em.flush).toHaveBeenCalled();
      expect(textRoomsGateway.onMessageUpdated).toHaveBeenCalledTimes(1);
      expect(textRoomsGateway.onMessageUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          id: uuidStringify(otherId),
          isRead: true,
        }),
      );
    });

    it('should not insert a read that already exists', async () => {
      const otherId = parse(v7());
      const otherMessage = {
        id: otherId,
        sender: { id: 2, username: 'bob' },
        room: { id: 10 },
        recipient: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
      } as unknown as MessageEntity;

      messageRepository.find.mockResolvedValue([otherMessage]);
      messageReadRepository.find.mockResolvedValue([
        {
          message: { id: otherId },
          reader: { id: mockUser.id },
        } as unknown as MessageReadEntity,
      ]);

      await service.markRead(mockUser, {
        messageIds: [uuidStringify(otherId)],
      });

      expect(messageReadRepository.create).not.toHaveBeenCalled();
      expect(textRoomsGateway.onMessageUpdated).toHaveBeenCalledTimes(1);
    });
  });

  describe('getReaders', () => {
    it('should throw NotFoundException when message does not exist', async () => {
      messageRepository.findOne.mockResolvedValue(null);

      await expect(service.getReaders(mockUser, v7())).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when user is not a participant', async () => {
      messageRepository.findOne.mockResolvedValue({
        id: parse(v7()),
        sender: { id: 9, username: 'other' },
        recipient: null,
        room: null,
      } as unknown as MessageEntity);

      await expect(service.getReaders(mockUser, v7())).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return readers for a participant', async () => {
      const msgId = v7();
      const reader = { id: 2, username: 'bob' } as unknown as UserEntity;
      messageRepository.findOne.mockResolvedValue({
        id: parse(msgId),
        sender: { id: mockUser.id, username: mockUser.username },
        recipient: null,
        room: { id: 10 },
      } as unknown as MessageEntity);
      messageReadRepository.find.mockResolvedValue([
        { reader } as unknown as MessageReadEntity,
      ]);
      usersService.toDto.mockReturnValue({
        id: 2,
        username: 'bob',
      } as unknown as GetUserDto);

      const result = await service.getReaders(mockUser, msgId);

      expect(result).toEqual([{ id: 2, username: 'bob' }]);
    });
  });
});
