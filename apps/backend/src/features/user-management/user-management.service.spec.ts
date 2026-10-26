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

import { ApiErrorCode, EPermission, EUserRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import type { GetUserSafeDto } from '../users/users.dto';
import type { UserEntity } from '../users/users.entity';
import { UserManagementService } from './user-management.service';
import { UsersService } from '../users/users.service';
import { PermissionsFacade } from '../permissions/permissions.facade';
import { RoomsFacade } from '../rooms/rooms.facade';
import { UsersDomainEvents } from '../users/users.events';
import { TwoFactorService } from '../two-factor/two-factor.service';

describe('UserManagementService', () => {
  let service: UserManagementService;
  let twoFactorService: jest.Mocked<Pick<TwoFactorService, 'adminReset'>>;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findAllAsFullDto'
      | 'findOne'
      | 'findOneAsFullDto'
      | 'toSafeDtoWithPermissions'
      | 'toFullDto'
      | 'updateUserRoles'
      | 'anonymizeLoaded'
      | 'removeLoaded'
    >
  >;
  let permissionsFacade: jest.Mocked<
    Pick<
      PermissionsFacade,
      | 'findRolesByIds'
      | 'assertCanManageRole'
      | 'assertCanManageUser'
      | 'assertCanGrantPermissions'
    >
  >;
  let roomsFacade: jest.Mocked<Pick<RoomsFacade, 'deleteRoomsByAuthor'>>;
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

  const mockUserDto: GetUserFullDto = {
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
      findAllAsFullDto: jest.fn(),
      findOne: jest.fn(),
      findOneAsFullDto: jest.fn(),
      toSafeDtoWithPermissions: jest.fn(
        async (user: UserEntity) => user as unknown as GetUserSafeDto,
      ),
      toFullDto: jest.fn(
        (user: UserEntity, permissions?: unknown) =>
          ({
            ...(user as unknown as GetUserSafeDto),
            email: user.email,
            permissions: permissions ?? [],
          }) as never,
      ),
      updateUserRoles: jest.fn(),
      anonymizeLoaded: jest.fn(),
      removeLoaded: jest.fn().mockResolvedValue(undefined),
    };

    permissionsFacade = {
      findRolesByIds: jest.fn().mockResolvedValue([]),
      assertCanManageRole: jest.fn(),
      assertCanManageUser: jest.fn(),
      assertCanGrantPermissions: jest.fn().mockResolvedValue(undefined),
    };

    roomsFacade = {
      deleteRoomsByAuthor: jest.fn().mockResolvedValue(undefined),
    };

    twoFactorService = {
      adminReset: jest.fn().mockResolvedValue(mockUserDto),
    };

    eventEmitter = { emit: jest.fn() };

    service = new UserManagementService(
      usersService as unknown as UsersService,
      permissionsFacade as unknown as PermissionsFacade,
      roomsFacade as unknown as RoomsFacade,
      twoFactorService as unknown as TwoFactorService,
      eventEmitter as never,
    );
  });

  describe('reads', () => {
    it('should list users through UsersService', async () => {
      usersService.findAllAsFullDto.mockResolvedValueOnce([mockUserDto]);

      await expect(service.findAll()).resolves.toEqual([mockUserDto]);
    });

    it('should read one user through UsersService', async () => {
      usersService.findOneAsFullDto.mockResolvedValueOnce(mockUserDto);

      await expect(service.findOne(1)).resolves.toBe(mockUserDto);
      expect(usersService.findOneAsFullDto).toHaveBeenCalledWith(1);
    });
  });

  describe('updateRole', () => {
    const ownerAuthor: GetUserFullDto = {
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
        UsersDomainEvents.USER_UPDATED,
        expect.objectContaining({ id: 5 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_PERMISSIONS_CHANGED,
        { userIds: [5] },
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

    it('should reject with ROLE_NOT_FOUND when any role id does not exist', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.findRolesByIds.mockResolvedValueOnce([
        { id: 2, priority: 10 } as never,
      ]);

      await expect(
        service.updateRole(5, { roleIds: [2, 999] }, ownerAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_NOT_FOUND,
      });
      expect(usersService.updateUserRoles).not.toHaveBeenCalled();
    });

    it('should deduplicate roleIds before looking up roles', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.findRolesByIds.mockResolvedValueOnce([
        { id: 2, priority: 10 } as never,
      ]);

      await service.updateRole(5, { roleIds: [2, 2] }, ownerAuthor);

      expect(permissionsFacade.findRolesByIds).toHaveBeenCalledWith([2]);
      expect(usersService.updateUserRoles).toHaveBeenCalledWith(target, [
        { id: 2, priority: 10 },
      ]);
    });

    it('should reject when assigning a role containing permissions the author cannot grant', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      const adminAuthor: GetUserFullDto = {
        ...mockUserDto,
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROLES],
      };
      usersService.findOne.mockResolvedValueOnce(target);
      permissionsFacade.findRolesByIds.mockResolvedValueOnce([
        {
          id: 3,
          priority: 10,
          permissions: [EPermission.MANAGE_SETTINGS],
        } as never,
      ]);
      permissionsFacade.assertCanGrantPermissions.mockRejectedValueOnce(
        AppException.forbidden(
          ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
          'Cannot grant permissions that you do not possess',
        ),
      );

      await expect(
        service.updateRole(5, { roleIds: [3] }, adminAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
      expect(usersService.updateUserRoles).not.toHaveBeenCalled();
    });

    it('should succeed when author holds all permissions of the assigned role', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      const adminAuthor: GetUserFullDto = {
        ...mockUserDto,
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROLES, EPermission.MANAGE_ROOMS],
      };
      usersService.findOne.mockResolvedValueOnce(target);
      const role = {
        id: 3,
        priority: 10,
        permissions: [EPermission.MANAGE_ROOMS],
      };
      permissionsFacade.findRolesByIds.mockResolvedValueOnce([role as never]);

      await service.updateRole(5, { roleIds: [3] }, adminAuthor);

      expect(permissionsFacade.assertCanGrantPermissions).toHaveBeenCalledWith(
        adminAuthor,
        role.permissions,
      );
      expect(usersService.updateUserRoles).toHaveBeenCalledWith(target, [role]);
    });

    it('should allow owner to assign any role regardless of permissions', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);
      const role = {
        id: 3,
        priority: 10,
        permissions: [EPermission.MANAGE_SETTINGS],
      };
      permissionsFacade.findRolesByIds.mockResolvedValueOnce([role as never]);

      await service.updateRole(5, { roleIds: [3] }, ownerAuthor);

      expect(permissionsFacade.assertCanGrantPermissions).toHaveBeenCalledWith(
        ownerAuthor,
        role.permissions,
      );
      expect(usersService.updateUserRoles).toHaveBeenCalledWith(target, [role]);
    });
  });

  describe('anonymize', () => {
    const ownerAuthor: GetUserFullDto = {
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
    const ownerAuthor: GetUserFullDto = {
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

      expect(roomsFacade.deleteRoomsByAuthor).toHaveBeenCalledWith(5);
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
      expect(roomsFacade.deleteRoomsByAuthor).not.toHaveBeenCalled();
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
      expect(roomsFacade.deleteRoomsByAuthor).not.toHaveBeenCalled();
      expect(usersService.removeLoaded).not.toHaveBeenCalled();
    });
  });

  describe('resetTwoFactor', () => {
    const adminAuthor: GetUserSafeDto = {
      id: 2,
      username: 'admin',
      fullname: 'Admin',
      isOwner: false,
      roles: [],
      permissions: [],
      createdAt: new Date(),
      updatedAt: null,
      avatar: null,
      avatarUrl: null,
      deletedAt: null,
    };

    it('rejects resetting owner 2FA', async () => {
      const ownerTarget = { ...mockUser, id: 1, isOwner: true } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(ownerTarget);

      await expect(
        service.resetTwoFactor(1, adminAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
      expect(twoFactorService.adminReset).not.toHaveBeenCalled();
    });

    it('rejects self-reset via admin endpoint', async () => {
      const selfTarget = { ...mockUser, id: 2 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(selfTarget);

      await expect(
        service.resetTwoFactor(2, adminAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.FORBIDDEN,
      });
      expect(twoFactorService.adminReset).not.toHaveBeenCalled();
    });

    it('rejects resetting deleted user with 404', async () => {
      const deletedTarget = {
        ...mockUser,
        id: 5,
        deletedAt: new Date(),
      } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(deletedTarget);

      await expect(
        service.resetTwoFactor(5, adminAuthor),
      ).rejects.toMatchObject({
        code: ApiErrorCode.USER_NOT_FOUND,
      });
      expect(twoFactorService.adminReset).not.toHaveBeenCalled();
    });

    it('successfully resets 2FA for manageable user', async () => {
      const target = { ...mockUser, id: 5 } as UserEntity;
      usersService.findOne.mockResolvedValueOnce(target);

      const result = await service.resetTwoFactor(5, adminAuthor);

      expect(permissionsFacade.assertCanManageUser).toHaveBeenCalledWith(
        adminAuthor,
        target,
      );
      expect(twoFactorService.adminReset).toHaveBeenCalledWith(
        target,
        adminAuthor.id,
      );
      expect(result).toBeDefined();
    });
  });
});
