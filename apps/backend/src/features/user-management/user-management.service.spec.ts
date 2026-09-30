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

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EUserRole } from '@konvoez/shared';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import { PasswordService } from '../../shared/services/password.service';
import { RoomEntity } from '../rooms/rooms.entity';
import { MessageEntity } from '../text-rooms/text-rooms.entity';
import {
  ROOM_AVATARS_BUCKET,
  USER_AVATARS_BUCKET,
  type FileService,
} from '@shared/services/file.service';
import type { GetUserDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { UserManagementService } from './user-management.service';
import { UsersService } from '../users/users.service';

describe('UserManagementService', () => {
  let service: UserManagementService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let fileService: jest.Mocked<FileService>;
  let usersService: jest.Mocked<
    Pick<UsersService, 'findAllAsDto' | 'findOneAsDto' | 'toDto'>
  >;

  const mockUser = {
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

  beforeEach(() => {
    mockEm = {
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
      assign: jest.fn().mockReturnValue(mockUser),
    } as unknown as jest.Mocked<EntityRepository<UserEntity>>;

    const passwordService = {
      hashPassword: jest.fn().mockResolvedValue('hashed_new_password'),
    } as unknown as jest.Mocked<PasswordService>;

    fileService = {
      delete: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FileService>;

    usersService = {
      findAllAsDto: jest.fn(),
      findOneAsDto: jest.fn(),
      toDto: jest.fn((user: UserEntity) => user as unknown as GetUserDto),
    };

    service = new UserManagementService(
      mockRepo,
      usersService as unknown as UsersService,
      passwordService,
      fileService,
    );
  });

  describe('reads', () => {
    it('should list users through UsersService', async () => {
      usersService.findAllAsDto.mockResolvedValueOnce([mockUserDto]);

      await expect(service.findAll()).resolves.toEqual([mockUserDto]);
    });

    it('should read one user through UsersService', async () => {
      usersService.findOneAsDto.mockResolvedValueOnce(mockUserDto);

      await expect(service.findOne(1)).resolves.toBe(mockUserDto);
      expect(usersService.findOneAsDto).toHaveBeenCalledWith(1);
    });
  });

  describe('updateRole', () => {
    const ownerAuthor: GetUserDto = {
      ...mockUserDto,
      id: 1,
      role: EUserRole.OWNER,
    };

    it('should promote a member to admin', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.MEMBER,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await service.updateRole(5, { role: EUserRole.ADMIN }, ownerAuthor);

      expect(mockRepo.assign).toHaveBeenCalledWith(target, {
        role: EUserRole.ADMIN,
      });
      expect(mockEm.flush).toHaveBeenCalled();
    });

    it('should demote an admin to member', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.ADMIN,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await service.updateRole(5, { role: EUserRole.MEMBER }, ownerAuthor);

      expect(mockRepo.assign).toHaveBeenCalledWith(target, {
        role: EUserRole.MEMBER,
      });
    });

    it('should reject changing the owner role', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.OWNER,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await expect(
        service.updateRole(5, { role: EUserRole.ADMIN }, ownerAuthor),
      ).rejects.toThrow(new ForbiddenException('Forbidden'));
      expect(mockRepo.assign).not.toHaveBeenCalled();
    });

    it('should reject assigning the owner role', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.MEMBER,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await expect(
        service.updateRole(5, { role: EUserRole.OWNER }, ownerAuthor),
      ).rejects.toThrow(
        new BadRequestException('Owner role cannot be assigned'),
      );
    });

    it('should reject changing the caller own role', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateRole(1, { role: EUserRole.ADMIN }, mockUserDto),
      ).rejects.toThrow(new ForbiddenException('Forbidden'));
    });
  });

  describe('anonymize', () => {
    const ownerAuthor: GetUserDto = {
      ...mockUserDto,
      id: 1,
      role: EUserRole.OWNER,
    };

    it('should replace identity fields, keep the role, and keep the user row', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.ADMIN,
        avatar: 'avatar-key',
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      const result = await service.anonymize(5, ownerAuthor);

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
      expect(result).toBe(target);
      expect(result.role).toBe(EUserRole.ADMIN);
    });

    it('should reject anonymizing the owner', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.OWNER,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await expect(service.anonymize(5, ownerAuthor)).rejects.toThrow(
        new ForbiddenException('Forbidden'),
      );
      expect(mockRepo.assign).not.toHaveBeenCalled();
    });
  });

  describe('removePhysically', () => {
    const ownerAuthor: GetUserDto = {
      ...mockUserDto,
      id: 1,
      role: EUserRole.OWNER,
    };

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

      await service.removePhysically(5, ownerAuthor);

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

    it('should reject physically deleting the owner', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.OWNER,
      } as UserEntity;
      mockEm.findOne.mockResolvedValueOnce(target);

      await expect(service.removePhysically(5, ownerAuthor)).rejects.toThrow(
        new ForbiddenException('Forbidden'),
      );
      expect(mockEm.nativeDelete).not.toHaveBeenCalled();
      expect(mockEm.remove).not.toHaveBeenCalled();
    });
  });
});
