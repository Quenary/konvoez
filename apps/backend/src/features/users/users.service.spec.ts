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

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UserEntity } from './users.entity';
import { PasswordService } from '../../shared/services/password.service';
import { EUserRole } from '@konvoez/shared';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import type { CreateUserDto, GetUserDto, UpdateUserDto } from './users.dto';

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
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as UserEntity;

  const mockUserDto: GetUserDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const adminDto: GetUserDto = {
    ...mockUserDto,
    id: 2,
    role: EUserRole.ADMIN,
  };

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

  describe('create', () => {
    const createDto: CreateUserDto = {
      username: 'newuser',
      password: 'StrongPassword123!',
      fullname: 'New User',
      email: 'newuser@example.com',
    };

    it('should throw ConflictException if username is already taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(service.create(createDto)).rejects.toThrow(
        new ConflictException('Username already taken'),
      );
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        username: createDto.username,
      });
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(null) // username check
        .mockResolvedValueOnce(mockUser); // email check

      await expect(service.create(createDto)).rejects.toThrow(
        new ConflictException('Email already taken'),
      );
      expect(mockRepo.findOne).toHaveBeenNthCalledWith(1, {
        username: createDto.username,
      });
      expect(mockRepo.findOne).toHaveBeenNthCalledWith(2, {
        email: createDto.email,
      });
    });

    it('should throw ForbiddenException if no users exist and role is not OWNER', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockForkedEm.count.mockResolvedValueOnce(0);

      await expect(service.create(createDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should successfully create user when username and email are unique', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      mockForkedEm.count.mockResolvedValueOnce(1);

      const result = await service.create(createDto);

      expect(passwordService.hashPassword).toHaveBeenCalledWith(
        createDto.password,
      );
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: createDto.username,
          email: createDto.email,
          role: EUserRole.MEMBER,
        }),
        { persist: true },
      );
      expect(mockEm.flush).toHaveBeenCalled();
      expect(result).toBe(mockUser);
    });
  });

  describe('update', () => {
    const updateDto: UpdateUserDto = {
      username: 'updated_username',
      email: 'updated_email@example.com',
    };

    it('should throw ForbiddenException when caller is not owner/admin and updating another user', async () => {
      const nonAuthorDto: GetUserDto = { ...mockUserDto, id: 99 };

      await expect(service.update(1, updateDto, nonAuthorDto)).rejects.toThrow(
        new ForbiddenException('Forbidden'),
      );
    });

    it('should throw BadRequestException when trying to assign OWNER role', async () => {
      await expect(
        service.update(1, { role: EUserRole.OWNER }, mockUserDto),
      ).rejects.toThrow(
        new BadRequestException('Owner role cannot be assigned'),
      );
    });

    it('should throw ConflictException if updated username is already taken by someone else', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.update(1, { username: 'taken_user' }, mockUserDto),
      ).rejects.toThrow(new ConflictException('Username already taken'));
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        username: 'taken_user',
        id: { $ne: 1 },
      });
    });

    it('should throw ConflictException if updated email is already taken by someone else', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.update(1, { email: 'taken@example.com' }, mockUserDto),
      ).rejects.toThrow(new ConflictException('Email already taken'));
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        email: 'taken@example.com',
        id: { $ne: 1 },
      });
    });

    it('should successfully update user when fields are valid', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(null) // username check
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce(mockUser); // findOne(id)

      const result = await service.update(1, updateDto, mockUserDto);

      expect(mockRepo.assign).toHaveBeenCalledWith(mockUser, updateDto);
      expect(mockEm.persist).toHaveBeenCalledWith(mockUser);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(result).toBe(mockUser);
    });
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

  describe('remove', () => {
    it('should throw ForbiddenException if user tries to delete another user without admin rights', async () => {
      const otherUserDto = { ...mockUserDto, id: 99 };
      await expect(service.remove(1, otherUserDto)).rejects.toThrow(
        new ForbiddenException('Forbidden'),
      );
    });

    it('should remove user when caller is the user themselves', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);
      await service.remove(1, mockUserDto);
      expect(mockEm.remove).toHaveBeenCalledWith(mockUser);
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should remove user when caller is admin', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);
      await service.remove(1, adminDto);
      expect(mockEm.remove).toHaveBeenCalledWith(mockUser);
      expect(mockEm.flush).toHaveBeenCalled();
    });
  });
});
