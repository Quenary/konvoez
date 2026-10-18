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

import { ApiErrorCode, EPermission } from '@konvoez/shared';
import { PermissionsFacade } from './permissions.facade';
import type { RolesService } from '../roles/roles.service';
import type { RoleEntity } from '../roles/roles.entity';
import type { GetUserDto } from '../users/users.dto';

describe('PermissionsFacade', () => {
  let facade: PermissionsFacade;
  let rolesService: jest.Mocked<
    Pick<RolesService, 'findDefaultRoles' | 'findByIds' | 'findAll'>
  >;

  const defaultRole = {
    id: 1,
    name: 'User',
    isDefault: true,
    permissions: [EPermission.MANAGE_ROOMS],
  } as unknown as RoleEntity;

  const customRole = {
    id: 2,
    name: 'Moderator',
    isDefault: false,
    permissions: [EPermission.MODERATE_MESSAGES],
  } as unknown as RoleEntity;

  beforeEach(() => {
    rolesService = {
      findDefaultRoles: jest.fn().mockResolvedValue([defaultRole]),
      findByIds: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
    };

    facade = new PermissionsFacade(rolesService as unknown as RolesService);
  });

  describe('getDefaultPermissions', () => {
    it('aggregates permissions from all default roles without duplicates', async () => {
      const duplicateRole = {
        id: 3,
        name: 'Another Default',
        isDefault: true,
        permissions: [EPermission.MANAGE_ROOMS, EPermission.SEND_MESSAGES],
      } as unknown as RoleEntity;
      rolesService.findDefaultRoles.mockResolvedValueOnce([
        defaultRole,
        duplicateRole,
      ]);

      const permissions = await facade.getDefaultPermissions();

      expect(permissions).toHaveLength(2);
      expect(permissions).toContain(EPermission.MANAGE_ROOMS);
      expect(permissions).toContain(EPermission.SEND_MESSAGES);
    });

    it('caches default permissions across multiple calls', async () => {
      rolesService.findDefaultRoles.mockResolvedValue([defaultRole]);

      const first = await facade.getDefaultPermissions();
      const second = await facade.getDefaultPermissions();

      expect(first).toEqual([EPermission.MANAGE_ROOMS]);
      expect(second).toEqual([EPermission.MANAGE_ROOMS]);
      expect(rolesService.findDefaultRoles).toHaveBeenCalledTimes(1);
    });

    it('invalidates cache when global permissions change event occurs', async () => {
      rolesService.findDefaultRoles.mockResolvedValue([defaultRole]);

      await facade.getDefaultPermissions();
      expect(rolesService.findDefaultRoles).toHaveBeenCalledTimes(1);

      // Specific user change should NOT invalidate default roles cache
      facade.handlePermissionsChanged({ userIds: [42] });
      await facade.getDefaultPermissions();
      expect(rolesService.findDefaultRoles).toHaveBeenCalledTimes(1);

      // Global (empty userIds) change SHOULD invalidate cache
      facade.handlePermissionsChanged({ userIds: [] });
      await facade.getDefaultPermissions();
      expect(rolesService.findDefaultRoles).toHaveBeenCalledTimes(2);
    });

    it('clears cache if loading default roles fails', async () => {
      rolesService.findDefaultRoles.mockRejectedValueOnce(
        new Error('DB error'),
      );

      await expect(facade.getDefaultPermissions()).rejects.toThrow('DB error');

      rolesService.findDefaultRoles.mockResolvedValueOnce([defaultRole]);
      await expect(facade.getDefaultPermissions()).resolves.toEqual([
        EPermission.MANAGE_ROOMS,
      ]);
    });
  });

  describe('getUserPermissions', () => {
    it('returns all permissions for an owner', async () => {
      const ownerUser = {
        id: 1,
        isOwner: true,
      };

      const permissions = await facade.getUserPermissions(ownerUser);

      expect(permissions).toEqual(Object.values(EPermission));
      expect(rolesService.findDefaultRoles).not.toHaveBeenCalled();
    });

    it('aggregates user roles and default roles for regular users', async () => {
      const regularUser = {
        id: 2,
        isOwner: false,
        roles: [customRole],
      };

      const permissions = await facade.getUserPermissions(regularUser);

      expect(permissions).toContain(EPermission.MODERATE_MESSAGES);
      expect(permissions).toContain(EPermission.MANAGE_ROOMS);
    });

    it('supports MikroORM collection with getItems() on roles', async () => {
      const userWithCollection = {
        id: 3,
        isOwner: false,
        roles: {
          getItems: () => [customRole],
        },
      };

      const permissions = await facade.getUserPermissions(
        userWithCollection as never,
      );

      expect(permissions).toContain(EPermission.MODERATE_MESSAGES);
      expect(permissions).toContain(EPermission.MANAGE_ROOMS);
    });

    it('does not access getItems on uninitialized MikroORM collection', async () => {
      const getItems = jest.fn();
      const userWithUninitializedCollection = {
        id: 3,
        isOwner: false,
        roles: {
          isInitialized: () => false,
          getItems,
        },
      };

      const permissions = await facade.getUserPermissions(
        userWithUninitializedCollection as never,
      );

      expect(getItems).not.toHaveBeenCalled();
      expect(permissions).toEqual([EPermission.MANAGE_ROOMS]);
    });
  });

  describe('hasPermission', () => {
    it('returns true unconditionally for owner', async () => {
      const owner = { id: 1, isOwner: true };

      expect(
        await facade.hasPermission(owner, EPermission.MANAGE_SETTINGS),
      ).toBe(true);
    });

    it('checks user permissions array when present on user object', async () => {
      const user = {
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROOMS],
      } as unknown as GetUserDto;

      expect(await facade.hasPermission(user, EPermission.MANAGE_ROOMS)).toBe(
        true,
      );
      expect(await facade.hasPermission(user, EPermission.MANAGE_ROLES)).toBe(
        false,
      );
    });
  });

  describe('hasAllPermissions', () => {
    it('returns true unconditionally for owner', async () => {
      const owner = { id: 1, isOwner: true };

      expect(
        await facade.hasAllPermissions(owner, [
          EPermission.MANAGE_SETTINGS,
          EPermission.MANAGE_ROLES,
        ]),
      ).toBe(true);
    });

    it('returns true when user has all requested permissions', async () => {
      const user = {
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROOMS, EPermission.MODERATE_MESSAGES],
      } as unknown as GetUserDto;

      expect(
        await facade.hasAllPermissions(user, [
          EPermission.MANAGE_ROOMS,
          EPermission.MODERATE_MESSAGES,
        ]),
      ).toBe(true);
    });

    it('returns false when user is missing any requested permission', async () => {
      const user = {
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROOMS],
      } as unknown as GetUserDto;

      expect(
        await facade.hasAllPermissions(user, [
          EPermission.MANAGE_ROOMS,
          EPermission.MANAGE_ROLES,
        ]),
      ).toBe(false);
    });

    it('resolves user permissions once when checking multiple permissions', async () => {
      const user = {
        id: 2,
        isOwner: false,
      };
      jest
        .spyOn(facade, 'getUserPermissions')
        .mockResolvedValueOnce([
          EPermission.MANAGE_ROOMS,
          EPermission.MODERATE_MESSAGES,
        ]);

      const result = await facade.hasAllPermissions(user as never, [
        EPermission.MANAGE_ROOMS,
        EPermission.MODERATE_MESSAGES,
      ]);

      expect(result).toBe(true);
      expect(facade.getUserPermissions).toHaveBeenCalledTimes(1);
    });
  });

  describe('role delegations', () => {
    it('delegates findRolesByIds to rolesService', async () => {
      rolesService.findByIds.mockResolvedValueOnce([customRole]);

      const result = await facade.findRolesByIds([2]);

      expect(rolesService.findByIds).toHaveBeenCalledWith([2]);
      expect(result).toEqual([customRole]);
    });

    it('delegates getAllRoles to rolesService.findAll', async () => {
      const dtos = [{ id: 1, name: 'User' }] as never;
      rolesService.findAll.mockResolvedValueOnce(dtos);

      const result = await facade.getAllRoles();

      expect(rolesService.findAll).toHaveBeenCalled();
      expect(result).toBe(dtos);
    });
  });

  describe('getUserMaxPriority', () => {
    it('returns Infinity for owner', () => {
      expect(facade.getUserMaxPriority({ id: 1, isOwner: true })).toBe(
        Infinity,
      );
    });

    it('returns 0 for user without roles', () => {
      expect(
        facade.getUserMaxPriority({ id: 2, isOwner: false, roles: [] }),
      ).toBe(0);
    });

    it('returns max priority among user roles', () => {
      expect(
        facade.getUserMaxPriority({
          id: 3,
          isOwner: false,
          roles: [{ priority: 10 }, { priority: 50 }, { priority: 20 }],
        }),
      ).toBe(50);
    });
  });

  describe('assertCanManageRole', () => {
    it('allows owner to manage any role priority', () => {
      expect(() =>
        facade.assertCanManageRole({ id: 1, isOwner: true }, 9999),
      ).not.toThrow();
    });

    it('allows author with higher priority to manage role', () => {
      expect(() =>
        facade.assertCanManageRole(
          { id: 2, isOwner: false, roles: [{ priority: 20 }] },
          10,
        ),
      ).not.toThrow();
    });

    it('rejects author with equal priority', () => {
      expect(() =>
        facade.assertCanManageRole(
          { id: 2, isOwner: false, roles: [{ priority: 20 }] },
          20,
        ),
      ).toThrow(
        expect.objectContaining({
          code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
        }),
      );
    });

    it('rejects author with lower priority', () => {
      expect(() =>
        facade.assertCanManageRole(
          { id: 2, isOwner: false, roles: [{ priority: 10 }] },
          20,
        ),
      ).toThrow(
        expect.objectContaining({
          code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
        }),
      );
    });
  });

  describe('assertCanGrantPermissions', () => {
    it('allows owner to grant any permissions', async () => {
      await expect(
        facade.assertCanGrantPermissions({ id: 1, isOwner: true }, [
          EPermission.MANAGE_ROLES,
          EPermission.MANAGE_SERVER,
        ]),
      ).resolves.not.toThrow();
    });

    it('allows author granting permissions they already possess', async () => {
      const author = {
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROOMS, EPermission.SEND_MESSAGES],
      };

      await expect(
        facade.assertCanGrantPermissions(author, [EPermission.MANAGE_ROOMS]),
      ).resolves.not.toThrow();
    });

    it('rejects author attempting to grant permissions they lack', async () => {
      const author = {
        id: 2,
        isOwner: false,
        permissions: [EPermission.MANAGE_ROOMS],
      };

      await expect(
        facade.assertCanGrantPermissions(author, [
          EPermission.MANAGE_ROOMS,
          EPermission.MANAGE_ROLES,
        ]),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
    });
  });

  describe('assertCanManageUser', () => {
    it('allows owner to manage any user', () => {
      expect(() =>
        facade.assertCanManageUser(
          { id: 1, isOwner: true },
          { id: 2, isOwner: false, roles: [{ priority: 100 }] },
        ),
      ).not.toThrow();
    });

    it('allows author with higher priority to manage lower priority user', () => {
      expect(() =>
        facade.assertCanManageUser(
          { id: 2, isOwner: false, roles: [{ priority: 50 }] },
          { id: 3, isOwner: false, roles: [{ priority: 20 }] },
        ),
      ).not.toThrow();
    });

    it('rejects author managing user with equal priority', () => {
      expect(() =>
        facade.assertCanManageUser(
          { id: 2, isOwner: false, roles: [{ priority: 50 }] },
          { id: 3, isOwner: false, roles: [{ priority: 50 }] },
        ),
      ).toThrow(
        expect.objectContaining({
          code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
        }),
      );
    });

    it('rejects author managing user with higher priority', () => {
      expect(() =>
        facade.assertCanManageUser(
          { id: 2, isOwner: false, roles: [{ priority: 30 }] },
          { id: 3, isOwner: false, roles: [{ priority: 50 }] },
        ),
      ).toThrow(
        expect.objectContaining({
          code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
        }),
      );
    });
  });
});
