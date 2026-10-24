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
import { AppException } from '@shared/errors/app.exception';
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import { PasswordService } from '../../shared/services/password.service';
import type { GetUserSafeDto, GetUserFullDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { RoomsFacade } from '../rooms/rooms.facade';
import { ProfileService } from './profile.service';
import type { UpdateProfileDto } from './profile.dto';
import { UsersDomainEvents } from '../users/users.events';

describe('ProfileService', () => {
  let service: ProfileService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findOne'
      | 'toSafeDto'
      | 'toSafeDtoWithPermissions'
      | 'toFullDto'
      | 'anonymizeLoaded'
      | 'removeLoaded'
    >
  >;
  let roomsFacade: jest.Mocked<Pick<RoomsFacade, 'deleteRoomsByAuthor'>>;
  let passwordService: jest.Mocked<PasswordService>;
  let eventEmitter: { emit: jest.Mock };

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

  const authorPublic: GetUserSafeDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    role: EUserRole.MEMBER,
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const author: GetUserFullDto = {
    ...authorPublic,
    email: 'test@example.com',
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
      toSafeDto: jest.fn().mockReturnValue(authorPublic),
      toSafeDtoWithPermissions: jest.fn().mockResolvedValue(authorPublic),
      toFullDto: jest.fn().mockReturnValue(author),
      anonymizeLoaded: jest.fn().mockResolvedValue(author),
      removeLoaded: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitter = { emit: jest.fn() };
    roomsFacade = {
      deleteRoomsByAuthor: jest.fn().mockResolvedValue(undefined),
    };

    service = new ProfileService(
      mockRepo,
      usersService as unknown as UsersService,
      roomsFacade as unknown as RoomsFacade,
      passwordService,
      eventEmitter as never,
    );
  });

  describe('updateSelf', () => {
    it('should throw ConflictException if username is taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateSelf(author, {
          username: 'taken_user',
        } as UpdateProfileDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_USERNAME_TAKEN,
      });
    });

    it('should throw ConflictException if email is taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateSelf(author, {
          email: 'taken@example.com',
        } as UpdateProfileDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_EMAIL_TAKEN,
      });
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
      expect(usersService.toSafeDtoWithPermissions).toHaveBeenCalledWith(
        mockUser,
      );
      expect(usersService.toFullDto).toHaveBeenCalledWith(
        mockUser,
        authorPublic.permissions,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_UPDATED,
        authorPublic,
      );
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
        AppException.notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found'),
      );

      await expect(
        service.updateSelf(author, {
          fullname: 'New Name',
        } as UpdateProfileDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_NOT_FOUND,
      });
    });
  });

  describe('anonymizeSelf', () => {
    it('should load the current user and anonymize through UsersService', async () => {
      const result = await service.anonymizeSelf(author);

      expect(usersService.findOne).toHaveBeenCalledWith(author.id);
      expect(usersService.anonymizeLoaded).toHaveBeenCalledWith(mockUser);
      expect(result).toBe(author);
    });

    it('should reject owner self-anonymize', async () => {
      await expect(
        service.anonymizeSelf({ ...author, role: EUserRole.OWNER }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_OWNER_DELETE_FORBIDDEN,
      });
      expect(usersService.anonymizeLoaded).not.toHaveBeenCalled();
    });
  });

  describe('removeSelf', () => {
    it('should remove the current user through UsersService', async () => {
      await service.removeSelf(author);

      expect(roomsFacade.deleteRoomsByAuthor).toHaveBeenCalledWith(author.id);
      expect(usersService.removeLoaded).toHaveBeenCalledWith(author.id);
    });

    it('should reject owner self-removal', async () => {
      await expect(
        service.removeSelf({ ...author, role: EUserRole.OWNER }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_OWNER_DELETE_FORBIDDEN,
      });
      expect(roomsFacade.deleteRoomsByAuthor).not.toHaveBeenCalled();
      expect(usersService.removeLoaded).not.toHaveBeenCalled();
    });
  });
});
