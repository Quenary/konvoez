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
    Cascade: {},
    EntityManager: class EntityManager {},
  };
});

import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { UserEntity } from './users.entity';
import { PasswordService } from '../../shared/services/password.service';
import { RoomEntity } from '../rooms/rooms.entity';
import { MessageEntity } from '../text-rooms/text-rooms.entity';
import {
  ROOM_AVATARS_BUCKET,
  USER_AVATARS_BUCKET,
  type FileService,
} from '@shared/services/file.service';
import { EUserRole } from '@konvoez/shared';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';

describe('UsersService', () => {
  let service: UsersService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let mockForkedEm: jest.Mocked<EntityManager>;
  let passwordService: jest.Mocked<PasswordService>;
  let fileService: jest.Mocked<FileService>;

  const mockUser: UserEntity = {
    id: 1,
    username: 'test_user',
    password: 'hashed_password',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as UserEntity;

  beforeEach(() => {
    mockForkedEm = {
      count: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockResolvedValue(mockUser),
    } as unknown as jest.Mocked<EntityManager>;

    mockEm = {
      fork: jest.fn().mockReturnValue(mockForkedEm),
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      remove: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      nativeUpdate: jest.fn().mockResolvedValue(0),
      nativeDelete: jest.fn().mockResolvedValue(0),
      transactional: jest.fn(
        async (callback: (em: EntityManager) => Promise<unknown>) =>
          callback(mockEm),
      ),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findOne: jest.fn(),
      findAll: jest.fn().mockResolvedValue([mockUser]),
      create: jest.fn().mockReturnValue(mockUser),
      assign: jest.fn().mockReturnValue(mockUser),
    } as unknown as jest.Mocked<EntityRepository<UserEntity>>;

    passwordService = {
      hashPassword: jest.fn().mockResolvedValue('hashed_new_password'),
      comparePassword: jest.fn(),
    } as unknown as jest.Mocked<PasswordService>;

    fileService = {
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileService>;

    service = new UsersService(mockRepo, passwordService, fileService);
  });

  describe('findOne', () => {
    it('should return user if found', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);
      const result = await service.findOne(1);
      expect(result).toBe(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  describe('findOneByUsernameOrEmail', () => {
    it('should look up by username and lowercased email', async () => {
      mockForkedEm.findOne.mockResolvedValueOnce(mockUser);

      const result = await service.findOneByUsernameOrEmail('Test_User');

      expect(mockForkedEm.findOne).toHaveBeenCalledWith(UserEntity, {
        $or: [{ username: 'Test_User' }, { email: 'test_user' }],
      });
      expect(result).toBe(mockUser);
    });

    it('should lowercase mixed-case email login for email branch', async () => {
      mockForkedEm.findOne.mockResolvedValueOnce(mockUser);

      await service.findOneByUsernameOrEmail('User@Example.COM');

      expect(mockForkedEm.findOne).toHaveBeenCalledWith(UserEntity, {
        $or: [{ username: 'User@Example.COM' }, { email: 'user@example.com' }],
      });
    });

    it('should throw NotFoundException when no user matches', async () => {
      mockForkedEm.findOne.mockResolvedValueOnce(null);

      await expect(service.findOneByUsernameOrEmail('missing')).rejects.toThrow(
        new NotFoundException('User not found'),
      );
    });
  });

  describe('toDto', () => {
    it('should map deletedAt', () => {
      const deletedAt = new Date('2026-09-30T12:00:00.000Z');
      const dto = service.toDto({
        ...mockUser,
        deletedAt,
      } as UserEntity);

      expect(dto.deletedAt).toEqual(deletedAt);
      expect(dto).not.toHaveProperty('password');
    });
  });

  describe('anonymizeLoaded', () => {
    it('should replace identity fields, keep the role, and keep the user row', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.ADMIN,
        avatar: 'avatar-key',
      } as UserEntity;

      const result = await service.anonymizeLoaded(target);

      expect(mockRepo.assign).toHaveBeenCalledWith(target, {
        username: 'deleted-5',
        fullname: 'Deleted user',
        email: 'deleted-5@users.invalid',
        avatar: null,
        password: 'hashed_new_password',
        deletedAt: expect.any(Date),
      });
      expect(mockRepo.assign).not.toHaveBeenCalledWith(
        target,
        expect.objectContaining({ role: expect.anything() }),
      );
      expect(mockEm.remove).not.toHaveBeenCalled();
      expect(fileService.delete).toHaveBeenCalledWith(
        'avatar-key',
        USER_AVATARS_BUCKET,
      );
      expect(result.role).toBe(EUserRole.ADMIN);
    });
  });

  describe('removeLoaded', () => {
    it('should delete the user, their rooms and messages, and leave other rooms untouched', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.MEMBER,
        avatar: 'avatar-key',
      } as UserEntity;
      const ownRoom = { id: 10, avatar: 'room-key' };
      const messageId = new Uint8Array(16);
      mockEm.findOne.mockResolvedValueOnce(target);
      mockEm.find
        .mockResolvedValueOnce([ownRoom] as never)
        .mockResolvedValueOnce([{ id: messageId }] as never);

      await service.removeLoaded(5);

      expect(mockEm.find).toHaveBeenNthCalledWith(1, RoomEntity, {
        author: 5,
      });
      expect(mockEm.find).toHaveBeenNthCalledWith(
        2,
        MessageEntity,
        {
          $or: [{ sender: 5 }, { recipient: 5 }, { room: { $in: [10] } }],
        },
        { fields: ['id'] },
      );
      expect(mockEm.nativeUpdate).toHaveBeenCalledWith(
        MessageEntity,
        { replyToId: { $in: [messageId] } },
        { replyToId: null },
      );
      expect(mockEm.nativeDelete).toHaveBeenCalledWith(MessageEntity, {
        id: { $in: [messageId] },
      });
      expect(mockEm.nativeDelete).toHaveBeenCalledWith(RoomEntity, {
        id: { $in: [10] },
      });
      expect(mockEm.nativeDelete).not.toHaveBeenCalledWith(
        RoomEntity,
        expect.objectContaining({ id: { $in: expect.arrayContaining([11]) } }),
      );
      expect(mockEm.remove).toHaveBeenCalledWith(target);
      expect(fileService.delete).toHaveBeenCalledWith(
        'avatar-key',
        USER_AVATARS_BUCKET,
      );
      expect(fileService.delete).toHaveBeenCalledWith(
        'room-key',
        ROOM_AVATARS_BUCKET,
      );
    });
  });
});
