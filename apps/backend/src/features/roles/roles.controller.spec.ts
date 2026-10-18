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
    UniqueConstraintViolationException: class UniqueConstraintViolationException extends Error {},
  };
});

import { ApiErrorCode, EPermission, createRoleSchema } from '@konvoez/shared';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { PermissionsFacade } from '../permissions/permissions.facade';
import type { GetUserDto } from '../users/users.dto';
import type { RoleEntity } from './roles.entity';
import type { CreateRoleDto } from './roles.dto';
import type { RoleDto } from './roles.dto';

describe('RolesController', () => {
  let controller: RolesController;
  let rolesService: jest.Mocked<
    Pick<
      RolesService,
      'findAll' | 'findOne' | 'findOneAsDto' | 'create' | 'update' | 'remove'
    >
  >;
  let permissionsFacade: jest.Mocked<
    Pick<PermissionsFacade, 'assertCanManageRole' | 'assertCanGrantPermissions'>
  >;

  const mockAuthor: GetUserDto = {
    id: 1,
    username: 'author',
    fullname: 'Author',
    email: 'author@example.com',
    isOwner: false,
    roles: [{ id: 10, name: 'Admin', color: null, priority: 50 }],
    permissions: [EPermission.MANAGE_ROLES, EPermission.MANAGE_ROOMS],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const existingRole = {
    id: 5,
    name: 'Moderator',
    color: '#00ff00',
    priority: 20,
    isDefault: false,
    permissions: [EPermission.MODERATE_MESSAGES],
  } as RoleEntity;

  const roleDto: RoleDto = {
    id: 5,
    name: 'Moderator',
    color: '#00ff00',
    priority: 20,
    isDefault: false,
    permissions: [EPermission.MODERATE_MESSAGES],
    createdAt: new Date(),
    updatedAt: null,
  };

  beforeEach(() => {
    rolesService = {
      findAll: jest.fn().mockResolvedValue([roleDto]),
      findOne: jest.fn().mockResolvedValue(existingRole),
      findOneAsDto: jest.fn().mockResolvedValue(roleDto),
      create: jest.fn().mockResolvedValue(roleDto),
      update: jest.fn().mockResolvedValue(roleDto),
      remove: jest.fn().mockResolvedValue(undefined),
    };

    permissionsFacade = {
      assertCanManageRole: jest.fn(),
      assertCanGrantPermissions: jest.fn().mockResolvedValue(undefined),
    };

    controller = new RolesController(
      rolesService as unknown as RolesService,
      permissionsFacade as unknown as PermissionsFacade,
    );
  });

  describe('findAll', () => {
    it('returns all roles from service', async () => {
      await expect(controller.findAll()).resolves.toEqual([roleDto]);
      expect(rolesService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns one role by id from service', async () => {
      await expect(controller.findOne(5)).resolves.toEqual(roleDto);
      expect(rolesService.findOneAsDto).toHaveBeenCalledWith(5);
    });
  });

  describe('create', () => {
    it('checks hierarchy and permissions then creates role', async () => {
      const dto = createRoleSchema.parse({
        name: 'New Role',
        priority: 10,
        permissions: [EPermission.MANAGE_ROOMS],
      }) as CreateRoleDto;

      const result = await controller.create(mockAuthor, dto);

      expect(permissionsFacade.assertCanManageRole).toHaveBeenCalledWith(
        mockAuthor,
        10,
      );
      expect(permissionsFacade.assertCanGrantPermissions).toHaveBeenCalledWith(
        mockAuthor,
        [EPermission.MANAGE_ROOMS],
      );
      expect(rolesService.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(roleDto);
    });

    it('rejects if author cannot manage requested priority', async () => {
      permissionsFacade.assertCanManageRole.mockImplementationOnce(() => {
        throw { code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION };
      });

      await expect(
        controller.create(
          mockAuthor,
          createRoleSchema.parse({
            name: 'Super',
            priority: 100,
          }) as CreateRoleDto,
        ),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
      expect(rolesService.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('checks existing and new priority and creates update', async () => {
      const dto = {
        name: 'Updated',
        priority: 30,
        permissions: [EPermission.MANAGE_ROOMS],
      };

      const result = await controller.update(mockAuthor, 5, dto);

      expect(rolesService.findOne).toHaveBeenCalledWith(5);
      expect(permissionsFacade.assertCanManageRole).toHaveBeenCalledWith(
        mockAuthor,
        existingRole.priority,
      );
      expect(permissionsFacade.assertCanManageRole).toHaveBeenCalledWith(
        mockAuthor,
        30,
      );
      expect(permissionsFacade.assertCanGrantPermissions).toHaveBeenCalledWith(
        mockAuthor,
        [EPermission.MANAGE_ROOMS],
      );
      expect(rolesService.update).toHaveBeenCalledWith(5, dto);
      expect(result).toBe(roleDto);
    });

    it('rejects if author cannot manage existing role priority', async () => {
      permissionsFacade.assertCanManageRole.mockImplementationOnce(() => {
        throw { code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION };
      });

      await expect(
        controller.update(mockAuthor, 5, { name: 'Updated' }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
      expect(rolesService.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('checks existing role priority then removes', async () => {
      await controller.remove(mockAuthor, 5);

      expect(rolesService.findOne).toHaveBeenCalledWith(5);
      expect(permissionsFacade.assertCanManageRole).toHaveBeenCalledWith(
        mockAuthor,
        existingRole.priority,
      );
      expect(rolesService.remove).toHaveBeenCalledWith(5);
    });

    it('rejects if author cannot manage existing role', async () => {
      permissionsFacade.assertCanManageRole.mockImplementationOnce(() => {
        throw { code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION };
      });

      await expect(controller.remove(mockAuthor, 5)).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
      });
      expect(rolesService.remove).not.toHaveBeenCalled();
    });
  });
});
