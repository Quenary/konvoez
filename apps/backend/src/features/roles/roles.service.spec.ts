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
import {
  type EntityManager,
  type EntityRepository,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { RoleEntity } from './roles.entity';
import { RolesService } from './roles.service';
import type { CreateRoleDto } from './roles.dto';

describe('RolesService', () => {
  let service: RolesService;
  let mockRepo: jest.Mocked<EntityRepository<RoleEntity>>;
  let mockEm: jest.Mocked<EntityManager> & { execute: jest.Mock };
  let mockEventEmitter: { emit: jest.Mock };

  const mockRole = {
    id: 1,
    name: 'Moderator',
    color: '#ff0000',
    priority: 10,
    isDefault: false,
    permissions: [EPermission.MODERATE_MESSAGES],
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as RoleEntity;

  const defaultRole = {
    id: 2,
    name: 'User',
    color: null,
    priority: 0,
    isDefault: true,
    permissions: [EPermission.MANAGE_ROOMS],
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as RoleEntity;

  beforeEach(() => {
    mockEm = {
      flush: jest.fn().mockResolvedValue(undefined),
      persist: jest.fn(),
      remove: jest.fn(),
      execute: jest.fn().mockResolvedValue([{ user_id: 10 }]),
    } as unknown as jest.Mocked<EntityManager> & { execute: jest.Mock };

    mockRepo = {
      getEntityManager: jest.fn().mockReturnValue(mockEm),
      findAll: jest.fn().mockResolvedValue([mockRole, defaultRole]),
      find: jest.fn().mockResolvedValue([mockRole]),
      findOne: jest.fn(),
      create: jest.fn().mockReturnValue(mockRole),
      assign: jest.fn(),
    } as unknown as jest.Mocked<EntityRepository<RoleEntity>>;

    mockEventEmitter = { emit: jest.fn() };

    service = new RolesService(mockRepo, mockEventEmitter as never);
  });

  describe('findAll', () => {
    it('returns roles mapped to DTOs ordered by priority and name', async () => {
      const result = await service.findAll();

      expect(mockRepo.findAll).toHaveBeenCalledWith({
        orderBy: { priority: 'DESC', name: 'ASC' },
      });
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Moderator');
      expect(result[1].name).toBe('User');
    });
  });

  describe('findByIds', () => {
    it('returns empty array when ids array is empty without querying repository', async () => {
      const result = await service.findByIds([]);

      expect(result).toEqual([]);
      expect(mockRepo.find).not.toHaveBeenCalled();
    });

    it('queries repository with $in when ids are provided', async () => {
      mockRepo.find.mockResolvedValueOnce([mockRole]);

      const result = await service.findByIds([1]);

      expect(mockRepo.find).toHaveBeenCalledWith({ id: { $in: [1] } });
      expect(result).toEqual([mockRole]);
    });
  });

  describe('findDefaultRoles', () => {
    it('queries repository for isDefault: true', async () => {
      mockRepo.find.mockResolvedValueOnce([defaultRole]);

      const result = await service.findDefaultRoles();

      expect(mockRepo.find).toHaveBeenCalledWith({ isDefault: true });
      expect(result).toEqual([defaultRole]);
    });
  });

  describe('findOne', () => {
    it('returns role when found', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockRole);

      const result = await service.findOne(1);

      expect(result).toBe(mockRole);
    });

    it('throws notFound when role does not exist', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.findOne(999)).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_NOT_FOUND,
      });
    });
  });

  describe('create', () => {
    it('creates a new role successfully', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.create({
        name: 'Moderator',
        color: '#ff0000',
        priority: 10,
        isDefault: false,
        permissions: [EPermission.MODERATE_MESSAGES],
      });

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Moderator' }),
        { persist: true },
      );
      expect(mockEm.flush).toHaveBeenCalled();
      expect(result.name).toBe('Moderator');
    });

    it('throws conflict when role name is already taken', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockRole);

      await expect(
        service.create({
          name: 'Moderator',
          priority: 0,
          isDefault: false,
          permissions: [],
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_NAME_TAKEN,
      });
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it('throws conflict on flush if UniqueConstraintViolationException occurs', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      mockEm.flush.mockRejectedValueOnce(
        new UniqueConstraintViolationException(new Error('unique')),
      );

      await expect(
        service.create({
          name: 'Moderator',
          priority: 0,
          isDefault: false,
          permissions: [],
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_NAME_TAKEN,
      });
    });
  });

  describe('update', () => {
    it('updates role fields and flushes changes', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(null);

      const result = await service.update(1, { name: 'Senior Moderator' });

      expect(mockRepo.assign).toHaveBeenCalledWith(
        mockRole,
        expect.objectContaining({ name: 'Senior Moderator' }),
      );
      expect(mockEm.flush).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('throws conflict if updated name conflicts with another role', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(defaultRole);

      await expect(service.update(1, { name: 'User' })).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_NAME_TAKEN,
      });
      expect(mockEm.flush).not.toHaveBeenCalled();
    });

    it('throws conflict on flush if UniqueConstraintViolationException occurs', async () => {
      mockRepo.findOne
        .mockResolvedValueOnce(mockRole)
        .mockResolvedValueOnce(null);
      mockEm.flush.mockRejectedValueOnce(
        new UniqueConstraintViolationException(new Error('unique')),
      );

      await expect(
        service.update(1, { name: 'Senior Moderator' }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_NAME_TAKEN,
      });
    });
  });

  describe('remove', () => {
    it('deletes non-default role and emits USER_PERMISSIONS_CHANGED for members', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockRole);
      mockEm.execute.mockResolvedValueOnce([{ user_id: 10 }]);

      await service.remove(1);

      expect(mockEm.remove).toHaveBeenCalledWith(mockRole);
      expect(mockEm.flush).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'entity-sync.user.permissions-changed',
        { userIds: [10] },
      );
    });

    it('rejects deleting default role', async () => {
      mockRepo.findOne.mockResolvedValueOnce(defaultRole);

      await expect(service.remove(2)).rejects.toMatchObject({
        code: ApiErrorCode.ROLE_CANNOT_DELETE_DEFAULT,
      });
      expect(mockEm.remove).not.toHaveBeenCalled();
    });
  });

  describe('findUserIdsByRole', () => {
    it('executes raw query on user_roles pivot table', async () => {
      mockEm.execute.mockResolvedValueOnce([{ user_id: 3 }, { user_id: 7 }]);

      const ids = await service.findUserIdsByRole(5);

      expect(mockEm.execute).toHaveBeenCalledWith(
        'select user_id from user_roles where role_id = ?',
        [5],
      );
      expect(ids).toEqual([3, 7]);
    });
  });

  describe('permissions changed events', () => {
    it('emits event with userIds: [] when creating default role', async () => {
      mockRepo.findOne.mockResolvedValueOnce(null);
      mockRepo.create.mockReturnValueOnce({
        ...mockRole,
        isDefault: true,
      } as RoleEntity);

      await service.create(
        createRoleSchema.parse({
          name: 'Default',
          isDefault: true,
          permissions: [],
        }) as CreateRoleDto,
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'entity-sync.user.permissions-changed',
        { userIds: [] },
      );
    });

    it('emits event with userIds: [] when updating default role', async () => {
      mockRepo.findOne.mockResolvedValueOnce(defaultRole);

      await service.update(2, {
        permissions: [EPermission.MANAGE_ROLES],
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'entity-sync.user.permissions-changed',
        { userIds: [] },
      );
    });

    it('emits event with userIds for non-default role when permissions change', async () => {
      mockRepo.findOne.mockResolvedValueOnce(mockRole);
      mockEm.execute.mockResolvedValueOnce([{ user_id: 42 }]);

      await service.update(1, {
        permissions: [EPermission.MANAGE_ROLES],
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'entity-sync.user.permissions-changed',
        { userIds: [42] },
      );
    });
  });
});
