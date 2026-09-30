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
import { EUserRole } from '@konvoez/shared';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';

describe('UsersService', () => {
  let service: UsersService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let mockForkedEm: jest.Mocked<EntityManager>;
  let passwordService: jest.Mocked<PasswordService>;

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

    service = new UsersService(mockRepo, passwordService);
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
});
