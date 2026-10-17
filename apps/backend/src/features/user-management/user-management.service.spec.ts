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
import type { EntityManager, EntityRepository } from '@mikro-orm/core';
import type { GetUserDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { UserManagementService } from './user-management.service';
import { UsersService } from '../users/users.service';
import { EntitySyncDomainEvents } from '@shared/events/entity-sync.events';

describe('UserManagementService', () => {
  let service: UserManagementService;
  let mockRepo: jest.Mocked<EntityRepository<UserEntity>>;
  let mockEm: jest.Mocked<EntityManager>;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findAllAsDto'
      | 'findOneAsDto'
      | 'toDto'
      | 'toDtoWithPermissions'
      | 'anonymizeLoaded'
      | 'removeLoaded'
    >
  >;
  let eventEmitter: { emit: jest.Mock };

  const mockUser = {
    id: 1,
    username: 'test_user',
    password: 'hashed_password',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    isOwner: false,
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
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    mockEm = {
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<EntityManager>;

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findOne: jest.fn(),
      assign: jest.fn().mockReturnValue(mockUser),
    } as unknown as jest.Mocked<EntityRepository<UserEntity>>;

    usersService = {
      findAllAsDto: jest.fn(),
      findOneAsDto: jest.fn(),
      toDto: jest.fn((user: UserEntity) => user as unknown as GetUserDto),
      toDtoWithPermissions: jest.fn(
        async (user: UserEntity) => user as unknown as GetUserDto,
      ),
      anonymizeLoaded: jest.fn(),
      removeLoaded: jest.fn().mockResolvedValue(undefined),
    };

    eventEmitter = { emit: jest.fn() };

    service = new UserManagementService(
      mockRepo,
      usersService as unknown as UsersService,
      eventEmitter as never,
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

    it('should assign roles to a user', async () => {
      const target = {
        ...mockUser,
        id: 5,
        roles: { set: jest.fn() },
      } as unknown as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);
      mockEm.find.mockResolvedValueOnce([{ id: 2 }] as never);

      await service.updateRole(5, { roleIds: [2] }, ownerAuthor);

      expect(target.roles.set).toHaveBeenCalledWith([{ id: 2 }]);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EntitySyncDomainEvents.USER_UPDATED,
        expect.objectContaining({ id: 5 }),
      );
    });

    it('should reject changing the owner role', async () => {
      const target = {
        ...mockUser,
        id: 5,
        isOwner: true,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await expect(
        service.updateRole(5, { role: EUserRole.ADMIN }, ownerAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
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
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_OWNER_ROLE_FORBIDDEN,
      });
    });

    it('should reject changing the caller own role', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateRole(1, { role: EUserRole.ADMIN }, mockUserDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
    });
  });

  describe('anonymize', () => {
    const ownerAuthor: GetUserDto = {
      ...mockUserDto,
      id: 1,
      role: EUserRole.OWNER,
    };

    it('should anonymize a manageable user through UsersService', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.ADMIN,
      } as UserEntity;
      const anonymized = { ...mockUserDto, id: 5, role: EUserRole.ADMIN };
      mockRepo.findOne.mockResolvedValueOnce(target);
      usersService.anonymizeLoaded.mockResolvedValueOnce(anonymized);

      const result = await service.anonymize(5, ownerAuthor);

      expect(usersService.anonymizeLoaded).toHaveBeenCalledWith(target);
      expect(result).toBe(anonymized);
    });

    it('should reject anonymizing the owner', async () => {
      const target = {
        ...mockUser,
        id: 5,
        isOwner: true,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await expect(service.anonymize(5, ownerAuthor)).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
      expect(usersService.anonymizeLoaded).not.toHaveBeenCalled();
    });
  });

  describe('removePhysically', () => {
    const ownerAuthor: GetUserDto = {
      ...mockUserDto,
      id: 1,
      role: EUserRole.OWNER,
    };

    it('should remove a manageable user through UsersService', async () => {
      const target = {
        ...mockUser,
        id: 5,
        role: EUserRole.MEMBER,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await service.removePhysically(5, ownerAuthor);

      expect(usersService.removeLoaded).toHaveBeenCalledWith(5);
    });

    it('should reject physically deleting the owner', async () => {
      const target = {
        ...mockUser,
        id: 5,
        isOwner: true,
      } as UserEntity;
      mockRepo.findOne.mockResolvedValueOnce(target);

      await expect(
        service.removePhysically(5, ownerAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
      expect(usersService.removeLoaded).not.toHaveBeenCalled();
    });
  });
});
