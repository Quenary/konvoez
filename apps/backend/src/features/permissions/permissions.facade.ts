import { Injectable } from '@nestjs/common';
import { EPermission } from '@konvoez/shared';
import { RoleEntity } from '../roles/roles.entity';
import { RoleDto } from '../roles/roles.dto';
import { RolesService } from '../roles/roles.service';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';

@Injectable()
export class PermissionsFacade {
  constructor(private readonly rolesService: RolesService) {}

  async getDefaultPermissions(): Promise<EPermission[]> {
    const defaultRoles = await this.rolesService.findDefaultRoles();
    const set = new Set<EPermission>();
    for (const role of defaultRoles) {
      for (const p of role.permissions) {
        set.add(p);
      }
    }
    return Array.from(set);
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
}
