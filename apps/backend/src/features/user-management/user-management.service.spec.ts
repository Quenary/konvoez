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
import type { GetUserDto } from '../users/users.dto';
import type { UserEntity } from '../users/users.entity';
import { UserManagementService } from './user-management.service';
import { UsersService } from '../users/users.service';
import { PermissionsFacade } from '../permissions/permissions.facade';
import { EntitySyncDomainEvents } from '@shared/events/entity-sync.events';

describe('UserManagementService', () => {
  let service: UserManagementService;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findAllAsDto'
      | 'findOne'
      | 'findOneAsDto'
      | 'toDtoWithPermissions'
      | 'updateUserRoles'
      | 'anonymizeLoaded'
      | 'removeLoaded'
    >
  >;
  let permissionsFacade: jest.Mocked<
    Pick<
      PermissionsFacade,
      'findRolesByIds' | 'assertCanManageRole' | 'assertCanManageUser'
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
    usersService = {
      findAllAsDto: jest.fn(),
      findOne: jest.fn(),
      findOneAsDto: jest.fn(),
      toDtoWithPermissions: jest.fn(
        async (user: UserEntity) => user as unknown as GetUserDto,
      ),
      updateUserRoles: jest.fn(),
      anonymizeLoaded: jest.fn(),
      removeLoaded: jest.fn().mockResolvedValue(undefined),
    };

    permissionsFacade = {
      findRolesByIds: jest.fn().mockResolvedValue([]),
      assertCanManageRole: jest.fn(),
      assertCanManageUser: jest.fn(),
    };

    eventEmitter = { emit: jest.fn() };

    service = new UserManagementService(
      usersService as unknown as UsersService,
      permissionsFacade as unknown as PermissionsFacade,
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
      } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.findRolesByIds.mockResolvedValueOnce([
        { id: 2 } as never,
      ]);

      await service.updateRole(5, { roleIds: [2] }, ownerAuthor);

      expect(permissionsFacade.findRolesByIds).toHaveBeenCalledWith([2]);
      expect(usersService.updateUserRoles).toHaveBeenCalledWith(target, [
        { id: 2 },
      ]);
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
      usersService.findOne.mockResolvedValueOnce(target);

      await expect(
        service.updateRole(5, { roleIds: [2] }, ownerAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
      expect(usersService.updateUserRoles).not.toHaveBeenCalled();
    });

    it('should reject changing the caller own role', async () => {
      usersService.findOne.mockResolvedValueOnce(mockUser);

      await expect(
        service.updateRole(1, { roleIds: [2] }, mockUserDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
    });

    it('should reject when assertCanManageUser rejects target', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.assertCanManageUser.mockImplementationOnce(() => {
        throw { code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION };
      });

      await expect(
        service.updateRole(5, { roleIds: [2] }, mockUserDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
    });

    it('should reject when assigning a role that author cannot manage', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.findRolesByIds.mockResolvedValueOnce([
        { id: 2, priority: 50 } as never,
      ]);
      permissionsFacade.assertCanManageRole.mockImplementationOnce(() => {
        throw { code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION };
      });

      await expect(
        service.updateRole(5, { roleIds: [2] }, mockUserDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
      expect(permissionsFacade.assertCanManageRole).toHaveBeenCalledWith(
        mockUserDto,
        50,
      );
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
      usersService.findOne.mockResolvedValueOnce(target);
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
      usersService.findOne.mockResolvedValueOnce(target);

      await expect(service.anonymize(5, ownerAuthor)).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
      expect(usersService.anonymizeLoaded).not.toHaveBeenCalled();
    });

    it('should reject anonymizing when assertCanManageUser rejects target', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.assertCanManageUser.mockImplementationOnce(() => {
        throw { code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION };
      });

      await expect(service.anonymize(5, mockUserDto)).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
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
      usersService.findOne.mockResolvedValueOnce(target);

      await service.removePhysically(5, ownerAuthor);

      expect(usersService.removeLoaded).toHaveBeenCalledWith(5);
    });

    it('should reject physically deleting the owner', async () => {
      const target = {
        ...mockUser,
        id: 5,
        isOwner: true,
      } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);

      await expect(
        service.removePhysically(5, ownerAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
      expect(usersService.removeLoaded).not.toHaveBeenCalled();
    });

    it('should reject physically deleting when assertCanManageUser rejects target', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.assertCanManageUser.mockImplementationOnce(() => {
        throw { code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION };
      });

      await expect(
        service.removePhysically(5, mockUserDto),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
      expect(usersService.removeLoaded).not.toHaveBeenCalled();
    });
  });
});
