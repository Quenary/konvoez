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

import { ApiErrorCode, EUserRole } from '@konvoez/shared';
import { UsersService } from './users.service';
import { UserEntity } from './users.entity';
import { PasswordService } from '../../shared/services/password.service';
import { MessageEntity } from '../text-rooms/text-rooms.entity';
import {
  USER_AVATARS_BUCKET,
  type FileService,
} from '@shared/services/file.service';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import { UsersDomainEvents } from './users.events';

describe('UsersService', () => {
  let service: UsersService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let mockForkedEm: jest.Mocked<EntityManager>;
  let passwordService: jest.Mocked<PasswordService>;
  let fileService: jest.Mocked<FileService>;
  let eventEmitter: { emit: jest.Mock };

  const mockUser: UserEntity = {
    id: 1,
    username: 'test_user',
    password: 'hashed_password',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    isOwner: false,
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

    eventEmitter = { emit: jest.fn() };
    const permissionsFacade = {
      getUserPermissions: jest.fn().mockResolvedValue([]),
      getDefaultPermissions: jest.fn().mockResolvedValue([]),
      findRolesByIds: jest.fn().mockResolvedValue([]),
      hasPermission: jest.fn().mockResolvedValue(true),
      hasAllPermissions: jest.fn().mockResolvedValue(true),
    };

    service = new UsersService(
      mockRepo,
      passwordService,
      fileService,
      eventEmitter as never,
      permissionsFacade as never,
    );
  });

  describe('findOne', () => {
    it('should return user if found', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);
      const result = await service.findOne(1);
      expect(result).toBe(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toMatchObject({
        code: ApiErrorCode.USER_NOT_FOUND,
      });
    });
  });

  describe('findOneByUsernameOrEmail', () => {
    it('should look up by username and lowercased email', async () => {
      mockForkedEm.findOne.mockResolvedValueOnce(mockUser);

      const result = await service.findOneByUsernameOrEmail('Test_User');

      expect(mockForkedEm.findOne).toHaveBeenCalledWith(
        UserEntity,
        {
          $or: [{ username: 'Test_User' }, { email: 'test_user' }],
        },
        { populate: ['roles'] },
      );
      expect(result).toBe(mockUser);
    });

    it('should lowercase mixed-case email login for email branch', async () => {
      mockForkedEm.findOne.mockResolvedValueOnce(mockUser);

      await service.findOneByUsernameOrEmail('User@Example.COM');

      expect(mockForkedEm.findOne).toHaveBeenCalledWith(
        UserEntity,
        {
          $or: [
            { username: 'User@Example.COM' },
            { email: 'user@example.com' },
          ],
        },
        { populate: ['roles'] },
      );
    });

    it('should throw NotFoundException when no user matches', async () => {
      mockForkedEm.findOne.mockResolvedValueOnce(null);

      await expect(
        service.findOneByUsernameOrEmail('missing'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_NOT_FOUND,
      });
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
      expect(result.isOwner).toBe(false);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_UPDATED,
        expect.objectContaining({ id: 5, isOwner: false }),
      );
    });
  });

  describe('removeLoaded', () => {
    it('should delete the user and their direct messages, and clean up avatar file', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.MEMBER,
        avatar: 'avatar-key',
      } as UserEntity;
      const messageId = new Uint8Array(16);
      mockEm.findOne.mockResolvedValueOnce(target);
      mockEm.find.mockResolvedValueOnce([{ id: messageId }] as never);

      await service.removeLoaded(5);

      expect(mockEm.find).toHaveBeenCalledWith(
        MessageEntity,
        {
          $or: [{ sender: 5 }, { recipient: 5 }],
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
      expect(mockEm.remove).toHaveBeenCalledWith(target);
      expect(fileService.delete).toHaveBeenCalledWith(
        'avatar-key',
        USER_AVATARS_BUCKET,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_DELETED,
        { id: 5 },
      );
    });

    it('should handle user deletion when user has no messages', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.MEMBER,
        avatar: null,
      } as UserEntity;
      mockEm.findOne.mockResolvedValueOnce(target);
      mockEm.find.mockResolvedValueOnce([]);

      await service.removeLoaded(5);

      expect(mockEm.find).toHaveBeenCalledWith(
        MessageEntity,
        {
          $or: [{ sender: 5 }, { recipient: 5 }],
        },
        { fields: ['id'] },
      );
      expect(mockEm.nativeDelete).not.toHaveBeenCalled();
      expect(mockEm.remove).toHaveBeenCalledWith(target);
      expect(fileService.delete).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_DELETED,
        { id: 5 },
      );
    });
  });
});
