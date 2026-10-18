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
      const roles = Array.isArray(user.roles)
        ? user.roles
        : typeof (user.roles as unknown as { getItems?: () => unknown[] })
              .getItems === 'function'
          ? (
              user.roles as unknown as { getItems: () => RoleEntity[] }
            ).getItems()
          : [];

      for (const role of roles) {
        if ('permissions' in role && Array.isArray(role.permissions)) {
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
    if ('permissions' in user && Array.isArray(user.permissions)) {
      return user.permissions.includes(permission);
    }
    const perms = await this.getUserPermissions(user as UserEntity);
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
    for (const p of permissions) {
      if (!(await this.hasPermission(user, p))) {
        return false;
      }
    }
    return true;
  }

  async findRolesByIds(roleIds: number[]): Promise<RoleEntity[]> {
    return this.rolesService.findByIds(roleIds);
  }

  async getAllRoles(): Promise<RoleDto[]> {
    return this.rolesService.findAll();
  }
}
