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

import { ConflictException, NotFoundException } from '@nestjs/common';
import { EUserRole } from '@konvoez/shared';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import { PasswordService } from '../../shared/services/password.service';
import type { GetUserDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { ProfileService } from './profile.service';
import type { UpdateProfileDto } from './profile.dto';

describe('ProfileService', () => {
  let service: ProfileService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let usersService: jest.Mocked<Pick<UsersService, 'findOne' | 'toDto'>>;
  let passwordService: jest.Mocked<PasswordService>;

  const mockUser = {
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

  const author: GetUserDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    mockEm = {
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findOne: jest.fn(),
      assign: jest.fn().mockReturnValue(mockUser),
    } as unknown as jest.Mocked<EntityRepository<UserEntity>>;

    passwordService = {
      hashPassword: jest.fn().mockResolvedValue('hashed_new_password'),
    } as unknown as jest.Mocked<PasswordService>;

    usersService = {
      findOne: jest.fn().mockResolvedValue(mockUser),
      toDto: jest.fn().mockReturnValue(author),
    };

    service = new ProfileService(
      mockRepo,
      usersService as unknown as UsersService,
      passwordService,
    );
  });

  describe('updateSelf', () => {
    it('should throw ConflictException if username is taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateSelf(author, {
          username: 'taken_user',
        } as UpdateProfileDto),
      ).rejects.toThrow(new ConflictException('Username already taken'));
    });

    it('should throw ConflictException if email is taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateSelf(author, {
          email: 'taken@example.com',
        } as UpdateProfileDto),
      ).rejects.toThrow(new ConflictException('Email already taken'));
    });

    it('should update profile fields and return dto', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

      const dto = {
        username: 'updated',
        email: 'updated@example.com',
        fullname: 'Updated Name',
      } as UpdateProfileDto;

      const result = await service.updateSelf(author, dto);

      expect(usersService.findOne).toHaveBeenCalledWith(author.id);
      expect(mockRepo.assign).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          username: 'updated',
          email: 'updated@example.com',
          fullname: 'Updated Name',
        }),
      );
      expect(mockEm.persist).toHaveBeenCalledWith(mockUser);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(usersService.toDto).toHaveBeenCalledWith(mockUser);
      expect(result).toBe(author);
    });

    it('should hash password when provided', async () => {
      mockRepo.findOne.mockResolvedValue(null);

      await service.updateSelf(author, {
        password: 'StrongPassword123!',
      } as UpdateProfileDto);

      expect(passwordService.hashPassword).toHaveBeenCalledWith(
        'StrongPassword123!',
      );
      expect(mockRepo.assign).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ password: 'hashed_new_password' }),
      );
    });

    it('should propagate NotFoundException from usersService.findOne', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      usersService.findOne.mockRejectedValueOnce(
        new NotFoundException('User not found'),
      );

      await expect(
        service.updateSelf(author, {
          fullname: 'New Name',
        } as UpdateProfileDto),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
