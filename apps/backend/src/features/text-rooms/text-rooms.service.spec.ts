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
    UniqueConstraintViolationException: class UniqueConstraintViolationException extends Error {},
  };
});

import { TextRoomsService } from './text-rooms.service';
import {
  MessageEntity,
  MessageReadEntity,
  MessageReactionEntity,
  MessageSearchTokenEntity,
} from './text-rooms.entity';
import { UsersService } from '../users/users.service';
import { RoomsService } from '../rooms/rooms.service';
import { EncryptionService } from '@shared/services/encryption.service';
import {
  EntityRepository,
  EntityManager,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { parse, v7, stringify as uuidStringify } from 'uuid';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GetUserDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { RoomEntity } from '../rooms/rooms.entity';
import {
  EAttachmentKind,
  ESettingKey,
  EUserRole,
  IAttachment,
  SCHEMA_ERROR,
} from '@konvoez/shared';
import { AttachmentsService } from '../attachments/attachments.service';
import { SettingsService } from '../settings/settings.service';
import { TextRoomDomainEvents } from '@shared/events/text-room.events';
import { NotificationsDomainEvents } from '@shared/events/notifications.events';

describe('TextRoomsService', () => {
  let service: TextRoomsService;
  let messageRepository: jest.Mocked<EntityRepository<MessageEntity>>;
  let messageReadRepository: jest.Mocked<EntityRepository<MessageReadEntity>>;
  let messageReactionRepository: jest.Mocked<
    EntityRepository<MessageReactionEntity>
  >;
  let usersService: jest.Mocked<UsersService>;
  let roomsService: jest.Mocked<RoomsService>;
  let encryptionService: jest.Mocked<EncryptionService>;
  let eventEmitter: { emit: jest.Mock };
  let em: jest.Mocked<EntityManager>;
  let attachmentsService: {
    findAttachedByMessageIds: jest.Mock;
    claimForMessage: jest.Mock;
  };
  let settingsService: { getValue: jest.Mock };

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
      clear: jest.fn(),
      getReference: jest.fn().mockImplementation((_entityName, id) => ({ id })),
      getRepository: jest.fn(),
      create: jest.fn().mockImplementation((_entityName, data) => data),
      nativeDelete: jest.fn().mockResolvedValue(1),
      transactional: jest.fn(async (work: (tx: EntityManager) => unknown) =>
        work(em),
      ),
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

    messageReactionRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((data) => data),
      assign: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<MessageReactionEntity>>;

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

    eventEmitter = { emit: jest.fn() };
    attachmentsService = {
      findAttachedByMessageIds: jest.fn().mockResolvedValue(new Map()),
      claimForMessage: jest.fn().mockResolvedValue(undefined),
    };
    settingsService = {
      getValue: jest.fn().mockImplementation(async (key: ESettingKey) => {
        if (key === ESettingKey.ATTACHMENTS_ENABLED) {
          return true;
        }
        if (key === ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE) {
          return 10;
        }
        return null;
      }),
    };
    em.getRepository.mockReturnValue(
      messageRepository as unknown as EntityRepository<object>,
    );

    service = new TextRoomsService(
      messageRepository,
      messageReadRepository,
      messageReactionRepository,
      usersService,
      roomsService,
      encryptionService,
      eventEmitter as never,
      attachmentsService as unknown as AttachmentsService,
      settingsService as unknown as SettingsService,
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
        attachmentIds: [],
        content: 'Hello World',
        roomId,
        recipientId: null,
      });

      expect(result.content).toBe('Decrypted content');
      expect(result.senderUsername).toBe('test_user');
      expect(result.roomId).toBe(roomId);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_CREATED,
        result,
      );
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        NotificationsDomainEvents.DIRECT_MESSAGE,
        expect.anything(),
      );
    });

    it('should emit a push notification event for a direct message', async () => {
      usersService.findOne.mockResolvedValue({
        id: 2,
        username: 'other_user',
      } as unknown as UserEntity);

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
        attachmentIds: [],
        content: 'Hello',
        roomId: null,
        recipientId: 2,
      });

      expect(result.recipientId).toBe(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        NotificationsDomainEvents.DIRECT_MESSAGE,
        {
          recipientId: 2,
          senderId: 1,
          senderUsername: 'test_user',
          messagePreview: 'Decrypted content',
          messageId: uuidStringify(msgId),
        },
      );
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
        attachmentIds: [],
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
          attachmentIds: [],
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
          attachmentIds: [],
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
        attachmentIds: [],
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

    function createdMessage(roomId: number, clientId?: string): MessageEntity {
      return {
        id: parse(v7()),
        sender: { id: 1, username: 'test_user' },
        room: { id: roomId },
        recipient: null,
        clientId: clientId ? parse(clientId) : null,
        createdAt: new Date(),
        updatedAt: null,
        contentEncrypted: new Uint8Array([1]),
        iv: new Uint8Array([2]),
        authTag: new Uint8Array([3]),
        searchTokens: { add: jest.fn() },
      } as unknown as MessageEntity;
    }

    it('returns the existing message for a duplicate clientId without a second event', async () => {
      const clientId = v7();
      const existing = createdMessage(10, clientId);
      messageRepository.findOne.mockResolvedValue(existing);
      const attachment: IAttachment = {
        id: v7(),
        kind: EAttachmentKind.FILE,
        name: 'notes.md',
        mime: 'application/octet-stream',
        size: 4,
        width: null,
        height: null,
        durationMs: null,
        url: '/api/v1/attachments/x/content',
        thumbnailUrl: null,
      };
      attachmentsService.findAttachedByMessageIds.mockResolvedValue(
        new Map([[uuidStringify(existing.id), [attachment]]]),
      );

      const result = await service.create(mockUser, {
        content: 'Hello',
        roomId: 10,
        recipientId: null,
        clientId,
        attachmentIds: [v7()],
      });

      expect(result.id).toBe(uuidStringify(existing.id));
      expect(result.clientId).toBe(clientId);
      expect(result.attachments).toEqual([attachment]);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(attachmentsService.claimForMessage).not.toHaveBeenCalled();
    });

    it('creates a new message when the same clientId belongs to another sender', async () => {
      const clientId = v7();
      messageRepository.findOne.mockResolvedValue(null);
      const created = createdMessage(10, clientId);
      messageRepository.create.mockReturnValue(created);
      roomsService.findOne.mockResolvedValue({
        id: 10,
      } as unknown as RoomEntity);

      await service.create(mockUser, {
        attachmentIds: [],
        content: 'Hello',
        roomId: 10,
        recipientId: null,
        clientId,
      });

      expect(messageRepository.findOne).toHaveBeenCalledWith(
        { sender: mockUser.id, clientId: parse(clientId) },
        expect.anything(),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_CREATED,
        expect.objectContaining({ clientId }),
      );
    });

    it('rejects a reused clientId aimed at a different chat', async () => {
      const clientId = v7();
      messageRepository.findOne.mockResolvedValue(createdMessage(99, clientId));

      await expect(
        service.create(mockUser, {
          attachmentIds: [],
          content: 'Hello',
          roomId: 10,
          recipientId: null,
          clientId,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('returns the winner when a concurrent insert hits the unique index', async () => {
      const clientId = v7();
      const winner = createdMessage(10, clientId);
      messageRepository.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      messageRepository.create.mockReturnValue(createdMessage(10, clientId));
      roomsService.findOne.mockResolvedValue({
        id: 10,
      } as unknown as RoomEntity);
      em.flush.mockRejectedValueOnce(
        new UniqueConstraintViolationException(new Error('unique')),
      );

      const result = await service.create(mockUser, {
        attachmentIds: [],
        content: 'Hello',
        roomId: 10,
        recipientId: null,
        clientId,
      });

      expect(result.id).toBe(uuidStringify(winner.id));
      expect(em.clear).toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('rejects empty text without attachments', async () => {
      await expect(
        service.create(mockUser, {
          attachmentIds: [],
          content: '<p></p>',
          roomId: 10,
          recipientId: null,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(mockUser, {
          attachmentIds: [],
          content: '<p><br></p>',
          roomId: 10,
          recipientId: null,
        }),
      ).rejects.toThrow(SCHEMA_ERROR.MESSAGE_EMPTY);
    });

    it('creates a message that only has files', async () => {
      const roomId = 10;
      const attachmentId = v7();
      const created = createdMessage(roomId);
      roomsService.findOne.mockResolvedValue({
        id: roomId,
      } as unknown as RoomEntity);
      messageRepository.create.mockReturnValue(created);
      const attachment: IAttachment = {
        id: attachmentId,
        kind: EAttachmentKind.FILE,
        name: 'notes.md',
        mime: 'application/octet-stream',
        size: 4,
        width: null,
        height: null,
        durationMs: null,
        url: '/api/v1/attachments/x/content',
        thumbnailUrl: null,
      };
      attachmentsService.findAttachedByMessageIds.mockResolvedValue(
        new Map([[uuidStringify(created.id), [attachment]]]),
      );

      const result = await service.create(mockUser, {
        content: '',
        roomId,
        recipientId: null,
        attachmentIds: [attachmentId],
      });

      expect(attachmentsService.claimForMessage).toHaveBeenCalledWith(
        em,
        mockUser.id,
        created.id,
        [attachmentId],
      );
      expect(result.attachments).toEqual([attachment]);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_CREATED,
        expect.objectContaining({ attachments: [attachment] }),
      );
    });

    it('rolls back when an attachment cannot be claimed', async () => {
      const attachmentId = v7();
      roomsService.findOne.mockResolvedValue({
        id: 10,
      } as unknown as RoomEntity);
      messageRepository.create.mockReturnValue(createdMessage(10));
      attachmentsService.claimForMessage.mockRejectedValue(
        new ConflictException({
          message: 'ATTACHMENTS_UNAVAILABLE',
          attachmentIds: [attachmentId],
        }),
      );

      await expect(
        service.create(mockUser, {
          content: '',
          roomId: 10,
          recipientId: null,
          attachmentIds: [attachmentId],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('rejects more attachments than the setting allows', async () => {
      settingsService.getValue.mockImplementation(async (key: ESettingKey) => {
        if (key === ESettingKey.ATTACHMENTS_ENABLED) return true;
        if (key === ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE) return 1;
        return null;
      });

      await expect(
        service.create(mockUser, {
          content: 'Hello',
          roomId: 10,
          recipientId: null,
          attachmentIds: [v7(), v7()],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
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
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_UPDATED,
        expect.anything(),
      );
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
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_DELETED,
        { id: msgId },
      );
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
        recipient: null,
        room: { id: 1 },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(existing);

      await expect(service.delete(mockUser, msgId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it.each([EUserRole.ADMIN, EUserRole.OWNER])(
      'should let %s delete another user room message',
      async (role) => {
        const msgId = v7();
        const existing = {
          id: parse(msgId),
          sender: { id: 999, username: 'another_user' },
          recipient: null,
          room: { id: 1 },
        } as unknown as MessageEntity;

        messageRepository.findOne.mockResolvedValue(existing);

        await service.delete({ ...mockUser, role }, msgId);

        expect(em.remove).toHaveBeenCalledWith(existing);
        expect(em.flush).toHaveBeenCalled();
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          TextRoomDomainEvents.MESSAGE_DELETED,
          { id: msgId },
        );
      },
    );

    it.each([EUserRole.ADMIN, EUserRole.OWNER])(
      'should throw ForbiddenException when %s deletes another user direct message',
      async (role) => {
        const msgId = v7();
        const existing = {
          id: parse(msgId),
          sender: { id: 999, username: 'another_user' },
          recipient: { id: mockUser.id },
          room: null,
        } as unknown as MessageEntity;

        messageRepository.findOne.mockResolvedValue(existing);

        await expect(
          service.delete({ ...mockUser, role }, msgId),
        ).rejects.toThrow(ForbiddenException);
      },
    );
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
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_UPDATED,
        expect.anything(),
      );
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
      expect(
        eventEmitter.emit.mock.calls.filter(
          ([event]) => event === TextRoomDomainEvents.MESSAGE_UPDATED,
        ),
      ).toHaveLength(1);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_UPDATED,
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
      expect(
        eventEmitter.emit.mock.calls.filter(
          ([event]) => event === TextRoomDomainEvents.MESSAGE_UPDATED,
        ),
      ).toHaveLength(1);
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

  describe('toggleReaction', () => {
    it('should throw NotFoundException if message does not exist', async () => {
      messageRepository.findOne.mockResolvedValue(null);

      await expect(
        service.toggleReaction(mockUser, v7(), '👍'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not participant', async () => {
      messageRepository.findOne.mockResolvedValue({
        id: parse(v7()),
        sender: { id: 99, username: 'stranger' },
        recipient: { id: 88, username: 'other' },
        room: null,
      } as unknown as MessageEntity);

      await expect(
        service.toggleReaction(mockUser, v7(), '👍'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should add reaction when user has no reaction on message', async () => {
      const msgId = v7();
      const rawId = parse(msgId);
      const message = {
        id: rawId,
        sender: { id: mockUser.id, username: mockUser.username },
        recipient: null,
        room: { id: 10 },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(message);
      messageReactionRepository.findOne.mockResolvedValueOnce(null);
      messageReactionRepository.find.mockResolvedValueOnce([
        {
          message: { id: rawId },
          emoji: '👍',
          user: { id: mockUser.id },
        } as unknown as MessageReactionEntity,
      ]); // loadReactions

      const result = await service.toggleReaction(mockUser, msgId, '👍');

      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_REACTION_UPDATED,
        expect.objectContaining({
          messageId: msgId,
          roomId: 10,
          reactions: [{ emoji: '👍', count: 1, userIds: [mockUser.id] }],
        }),
      );
      expect(result).toEqual([
        { emoji: '👍', count: 1, userIds: [mockUser.id] },
      ]);
    });

    it('should remove reaction when same emoji is clicked (toggle off)', async () => {
      const msgId = v7();
      const rawId = parse(msgId);
      const message = {
        id: rawId,
        sender: { id: mockUser.id, username: mockUser.username },
        recipient: null,
        room: { id: 10 },
      } as unknown as MessageEntity;

      const existingReaction = {
        id: 1,
        message: { id: rawId },
        emoji: '👍',
        user: { id: mockUser.id },
      } as unknown as MessageReactionEntity;

      messageRepository.findOne.mockResolvedValue(message);
      messageReactionRepository.findOne.mockResolvedValueOnce(existingReaction);
      messageReactionRepository.find.mockResolvedValueOnce([]); // loadReactions after removal

      const result = await service.toggleReaction(mockUser, msgId, '👍');

      expect(em.remove).toHaveBeenCalledWith(existingReaction);
      expect(em.flush).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_REACTION_UPDATED,
        expect.objectContaining({
          messageId: msgId,
          roomId: 10,
          reactions: [],
        }),
      );
      expect(result).toEqual([]);
    });

    it('should replace previous reaction when different emoji is clicked (Telegram style)', async () => {
      const msgId = v7();
      const rawId = parse(msgId);
      const message = {
        id: rawId,
        sender: { id: mockUser.id, username: mockUser.username },
        recipient: null,
        room: { id: 10 },
      } as unknown as MessageEntity;

      const oldReaction = {
        id: 1,
        message: { id: rawId },
        emoji: '👍',
        user: { id: mockUser.id },
      } as unknown as MessageReactionEntity;

      messageRepository.findOne.mockResolvedValue(message);
      messageReactionRepository.findOne.mockResolvedValueOnce(oldReaction);
      messageReactionRepository.find.mockResolvedValueOnce([
        {
          message: { id: rawId },
          emoji: '❤️',
          user: { id: mockUser.id },
        } as unknown as MessageReactionEntity,
      ]); // loadReactions after replace

      const result = await service.toggleReaction(mockUser, msgId, '❤️');

      expect(oldReaction.emoji).toBe('❤️');
      expect(em.flush).toHaveBeenCalled();
      expect(result).toEqual([
        { emoji: '❤️', count: 1, userIds: [mockUser.id] },
      ]);
    });

    it('should throw NotFoundException when message is not found', async () => {
      const msgId = v7();
      messageRepository.findOne.mockResolvedValue(null);

      await expect(
        service.toggleReaction(mockUser, msgId, '👍'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should throw ForbiddenException when user is not a participant in DM', async () => {
      const msgId = v7();
      const rawId = parse(msgId);
      const foreignMessage = {
        id: rawId,
        sender: { id: 99, username: 'stranger1' },
        recipient: { id: 100, username: 'stranger2' },
        room: null,
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(foreignMessage);

      await expect(
        service.toggleReaction(mockUser, msgId, '👍'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should normalize uppercase message id for reaction lookup and domain event', async () => {
      const msgId = v7().toUpperCase();
      const rawId = parse(msgId);
      const normalizedMsgId = msgId.toLowerCase();
      const message = {
        id: rawId,
        sender: { id: mockUser.id, username: mockUser.username },
        recipient: null,
        room: { id: 10 },
      } as unknown as MessageEntity;

      messageRepository.findOne.mockResolvedValue(message);
      messageReactionRepository.findOne.mockResolvedValueOnce(null);
      messageReactionRepository.find.mockResolvedValueOnce([
        {
          message: { id: rawId },
          emoji: '👍',
          user: { id: mockUser.id },
        } as unknown as MessageReactionEntity,
      ]);

      const result = await service.toggleReaction(mockUser, msgId, '👍');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TextRoomDomainEvents.MESSAGE_REACTION_UPDATED,
        expect.objectContaining({
          messageId: normalizedMsgId,
          reactions: [{ emoji: '👍', count: 1, userIds: [mockUser.id] }],
        }),
      );
      expect(result).toEqual([
        { emoji: '👍', count: 1, userIds: [mockUser.id] },
      ]);
    });
  });
});
