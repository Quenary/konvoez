import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  EntityManager,
  EntityRepository,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { ApiErrorCode, IRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { ensureRequestContext } from '@shared/utils/request-context.util';
import { RolesDomainEvents, emitRolesDomainEvent } from './roles.events';
import { RoleEntity } from './roles.entity';
import { CreateRoleDto, RoleDto, UpdateRoleDto } from './roles.dto';

@Injectable()
export class RolesService {
  private get em(): EntityManager {
    return this.repo.getEntityManager();
  }

  constructor(
    @InjectRepository(RoleEntity)
    private readonly repo: EntityRepository<RoleEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<RoleDto[]> {
    return ensureRequestContext(this.em, async () => {
      const roles = await this.repo.findAll({
        orderBy: { priority: 'DESC', name: 'ASC' },
      });
      return roles.map((r) => this.toDto(r));
    });
  }

  async findByIds(ids: number[]): Promise<RoleEntity[]> {
    return ensureRequestContext(this.em, async () => {
      if (!ids.length) {
        return [];
      }
      return this.repo.find({ id: { $in: ids } });
    });
  }

  async findDefaultRoles(): Promise<RoleEntity[]> {
    return ensureRequestContext(this.em, async () => {
      return this.repo.find({ isDefault: true });
    });
  }

  async findUserIdsByRole(roleId: number): Promise<number[]> {
    return ensureRequestContext(this.em, async () => {
      const em = this.em as unknown as {
        execute: (
          query: string,
          params?: unknown[],
        ) => Promise<Array<{ user_id: number }>>;
      };
      const rows = await em.execute(
        'select user_id from user_roles where role_id = ?',
        [roleId],
      );
      return rows.map((r) => r.user_id);
    });
  }

  async findOne(id: number): Promise<RoleEntity> {
    return ensureRequestContext(this.em, async () => {
      const role = await this.repo.findOne({ id });
      if (!role) {
        throw AppException.notFound(
          ApiErrorCode.ROLE_NOT_FOUND,
          'Role not found',
        );
      }
      return role;
    });
  }

  async findOneAsSafeDto(id: number): Promise<RoleDto> {
    const role = await this.findOne(id);
    return this.toDto(role);
  }

  async create(dto: CreateRoleDto): Promise<RoleDto> {
    return ensureRequestContext(this.em, async () => {
      const existing = await this.repo.findOne({ name: dto.name });
      if (existing) {
        throw AppException.conflict(
          ApiErrorCode.ROLE_NAME_TAKEN,
          'Role name already taken',
        );
      }

      const role = this.repo.create(
        {
          name: dto.name,
          color: dto.color ?? null,
          priority: dto.priority ?? 0,
          isDefault: dto.isDefault ?? false,
          mentionable: dto.mentionable ?? false,
          permissions: dto.permissions ?? [],
        },
        { persist: true },
      );

      try {
        await this.em.flush();
      } catch (error) {
        if (error instanceof UniqueConstraintViolationException) {
          throw AppException.conflict(
            ApiErrorCode.ROLE_NAME_TAKEN,
            'Role name already taken',
          );
        }
        throw error;
      }

      emitRolesDomainEvent(
        this.eventEmitter,
        RolesDomainEvents.ROLES_CHANGED,
        {},
      );

      if (role.isDefault) {
        emitRolesDomainEvent(
          this.eventEmitter,
          RolesDomainEvents.ROLE_PERMISSIONS_CHANGED,
          { userIds: [] },
        );
      }

      return this.toDto(role);
    });
  }

  async update(id: number, dto: UpdateRoleDto): Promise<RoleDto> {
    return ensureRequestContext(this.em, async () => {
      const role = await this.findOne(id);
      const wasDefault = role.isDefault;
      const isDefaultChanged =
        dto.isDefault !== undefined && dto.isDefault !== wasDefault;
      const permissionsChanged =
        dto.permissions !== undefined &&
        JSON.stringify(dto.permissions) !== JSON.stringify(role.permissions);
      const priorityChanged =
        dto.priority !== undefined && dto.priority !== role.priority;

      if (dto.name && dto.name !== role.name) {
        const existing = await this.repo.findOne({
          name: dto.name,
          id: { $ne: id },
        });
        if (existing) {
          throw AppException.conflict(
            ApiErrorCode.ROLE_NAME_TAKEN,
            'Role name already taken',
          );
        }
      }

      this.repo.assign(role, {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color ?? null } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.mentionable !== undefined
          ? { mentionable: dto.mentionable }
          : {}),
        ...(dto.permissions !== undefined
          ? { permissions: dto.permissions }
          : {}),
      });

      try {
        await this.em.flush();
      } catch (error) {
        if (error instanceof UniqueConstraintViolationException) {
          throw AppException.conflict(
            ApiErrorCode.ROLE_NAME_TAKEN,
            'Role name already taken',
          );
        }
        throw error;
      }

      emitRolesDomainEvent(
        this.eventEmitter,
        RolesDomainEvents.ROLES_CHANGED,
        {},
      );

      if (isDefaultChanged || wasDefault) {
        emitRolesDomainEvent(
          this.eventEmitter,
          RolesDomainEvents.ROLE_PERMISSIONS_CHANGED,
          { userIds: [] },
        );
      } else if (permissionsChanged || priorityChanged) {
        const userIds = await this.findUserIdsByRole(id);
        if (userIds.length > 0) {
          emitRolesDomainEvent(
            this.eventEmitter,
            RolesDomainEvents.ROLE_PERMISSIONS_CHANGED,
            { userIds },
          );
        }
      }

      return this.toDto(role);
    });
  }

  async remove(id: number): Promise<void> {
    return ensureRequestContext(this.em, async () => {
      const role = await this.findOne(id);
      if (role.isDefault) {
        throw AppException.badRequest(
          ApiErrorCode.ROLE_CANNOT_DELETE_DEFAULT,
          'Cannot delete default role',
        );
      }

      const userIds = await this.findUserIdsByRole(id);
      this.em.remove(role);
      await this.em.flush();

      emitRolesDomainEvent(
        this.eventEmitter,
        RolesDomainEvents.ROLES_CHANGED,
        {},
      );

      if (userIds.length > 0) {
        emitRolesDomainEvent(
          this.eventEmitter,
          RolesDomainEvents.ROLE_PERMISSIONS_CHANGED,
          { userIds },
        );
      }
    });
  }

  toDto(role: RoleEntity): RoleDto {
    return {
      id: role.id,
      name: role.name,
      color: role.color ?? null,
      priority: role.priority,
      isDefault: role.isDefault,
      mentionable: role.mentionable,
      permissions: role.permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    } satisfies IRole;
  }
}
