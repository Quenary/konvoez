import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ApiErrorCode, EPermission } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { EntitySyncDomainEvents } from '@shared/events/entity-sync.events';
import { RoleEntity } from '../roles/roles.entity';
import { RoleDto } from '../roles/roles.dto';
import { RolesService } from '../roles/roles.service';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';

@Injectable()
export class PermissionsFacade {
  private defaultPermissionsCache: Promise<EPermission[]> | null = null;

  constructor(private readonly rolesService: RolesService) {}

  async getDefaultPermissions(): Promise<EPermission[]> {
    if (!this.defaultPermissionsCache) {
      this.defaultPermissionsCache = this.loadDefaultPermissions();
    }
    const perms = await this.defaultPermissionsCache;
    return [...perms];
  }

  private async loadDefaultPermissions(): Promise<EPermission[]> {
    try {
      const defaultRoles = await this.rolesService.findDefaultRoles();
      const set = new Set<EPermission>();
      for (const role of defaultRoles) {
        for (const p of role.permissions) {
          set.add(p);
        }
      }
      return Array.from(set);
    } catch (err) {
      this.defaultPermissionsCache = null;
      throw err;
    }
  }

  @OnEvent(EntitySyncDomainEvents.USER_PERMISSIONS_CHANGED)
  handlePermissionsChanged(payload?: { userIds?: number[] }): void {
    if (!payload?.userIds || payload.userIds.length === 0) {
      this.clearDefaultPermissionsCache();
    }
  }

  clearDefaultPermissionsCache(): void {
    this.defaultPermissionsCache = null;
  }

  async getUserPermissions(
    user:
      | UserEntity
      | GetUserDto
      | {
          id: number;
          isOwner: boolean;
          roles?: { permissions?: EPermission[] }[];
        },
  ): Promise<EPermission[]> {
    if (user.isOwner) {
      return Object.values(EPermission);
    }

    const set = new Set<EPermission>();

    if ('roles' in user && user.roles) {
      let roles: unknown[] = [];
      if (Array.isArray(user.roles)) {
        roles = user.roles;
      } else {
        const coll = user.roles as unknown as {
          isInitialized?: () => boolean;
          getItems?: () => unknown[];
        };
        if (
          typeof coll.getItems === 'function' &&
          (typeof coll.isInitialized !== 'function' || coll.isInitialized())
        ) {
          roles = coll.getItems();
        }
      }

      for (const role of roles) {
        if (
          role &&
          typeof role === 'object' &&
          'permissions' in role &&
          Array.isArray(role.permissions)
        ) {
          for (const p of role.permissions) {
            set.add(p);
          }
        }
      }
    }

    const defaultPerms = await this.getDefaultPermissions();
    for (const p of defaultPerms) {
      set.add(p);
    }

    return Array.from(set);
  }

  async hasPermission(
    user:
      | UserEntity
      | GetUserDto
      | { id: number; isOwner: boolean; permissions?: EPermission[] },
    permission: EPermission,
  ): Promise<boolean> {
    if (user.isOwner) {
      return true;
    }
    const perms =
      'permissions' in user && Array.isArray(user.permissions)
        ? user.permissions
        : await this.getUserPermissions(user as UserEntity);
    return perms.includes(permission);
  }

  async hasAllPermissions(
    user:
      | UserEntity
      | GetUserDto
      | { id: number; isOwner: boolean; permissions?: EPermission[] },
    permissions: readonly EPermission[],
  ): Promise<boolean> {
    if (user.isOwner) {
      return true;
    }
    const perms =
      'permissions' in user && Array.isArray(user.permissions)
        ? user.permissions
        : await this.getUserPermissions(user as UserEntity);
    return permissions.every((p) => perms.includes(p));
  }

  async findRolesByIds(roleIds: number[]): Promise<RoleEntity[]> {
    return this.rolesService.findByIds(roleIds);
  }

  async getAllRoles(): Promise<RoleDto[]> {
    return this.rolesService.findAll();
  }

  getUserMaxPriority(
    user:
      | UserEntity
      | GetUserDto
      | {
          id: number;
          isOwner: boolean;
          roles?: { priority?: number }[];
        },
  ): number {
    if (user.isOwner) {
      return Infinity;
    }

    if (!('roles' in user) || !user.roles) {
      return 0;
    }

    let roles: { priority?: number }[] = [];
    if (Array.isArray(user.roles)) {
      roles = user.roles;
    } else {
      const coll = user.roles as unknown as {
        isInitialized?: () => boolean;
        getItems?: () => { priority?: number }[];
      };
      if (
        typeof coll.getItems === 'function' &&
        (typeof coll.isInitialized !== 'function' || coll.isInitialized())
      ) {
        roles = coll.getItems();
      }
    }

    let max = 0;
    for (const r of roles) {
      if (typeof r?.priority === 'number' && r.priority > max) {
        max = r.priority;
      }
    }
    return max;
  }

  assertCanManageRole(
    author:
      | UserEntity
      | GetUserDto
      | { id: number; isOwner: boolean; roles?: { priority?: number }[] },
    rolePriority: number,
  ): void {
    if (author.isOwner) {
      return;
    }

    const authorPriority = this.getUserMaxPriority(author);
    if (authorPriority <= rolePriority) {
      throw AppException.forbidden(
        ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
        'Cannot manage role with equal or higher priority than your own',
      );
    }
  }

  async assertCanGrantPermissions(
    author:
      | UserEntity
      | GetUserDto
      | { id: number; isOwner: boolean; permissions?: EPermission[] },
    permissions: readonly EPermission[],
  ): Promise<void> {
    if (author.isOwner) {
      return;
    }

    if (!permissions || permissions.length === 0) {
      return;
    }

    const canGrant = await this.hasAllPermissions(author, permissions);
    if (!canGrant) {
      throw AppException.forbidden(
        ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
        'Cannot grant permissions that you do not possess',
      );
    }
  }

  assertCanManageUser(
    author:
      | UserEntity
      | GetUserDto
      | { id: number; isOwner: boolean; roles?: { priority?: number }[] },
    target:
      | UserEntity
      | GetUserDto
      | { id: number; isOwner: boolean; roles?: { priority?: number }[] },
  ): void {
    if (author.isOwner) {
      return;
    }

    const authorPriority = this.getUserMaxPriority(author);
    const targetPriority = this.getUserMaxPriority(target);
    if (authorPriority <= targetPriority) {
      throw AppException.forbidden(
        ApiErrorCode.ROLE_HIERARCHY_VIOLATION,
        'Cannot manage user with equal or higher priority than your own',
      );
    }
  }
}
