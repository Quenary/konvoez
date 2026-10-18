import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { ApiErrorCode, IRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
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
  ) {}

  async findAll(): Promise<RoleDto[]> {
    const roles = await this.repo.findAll({
      orderBy: { priority: 'DESC', name: 'ASC' },
    });
    return roles.map((r) => this.toDto(r));
  }

  async findByIds(ids: number[]): Promise<RoleEntity[]> {
    if (!ids.length) {
      return [];
    }
    return this.repo.find({ id: { $in: ids } });
  }

  async findDefaultRoles(): Promise<RoleEntity[]> {
    return this.repo.find({ isDefault: true });
  }

  async findOne(id: number): Promise<RoleEntity> {
    const role = await this.repo.findOne({ id });
    if (!role) {
      throw AppException.notFound(
        ApiErrorCode.ROLE_NOT_FOUND,
        'Role not found',
      );
    }
    return role;
  }

  async findOneAsDto(id: number): Promise<RoleDto> {
    const role = await this.findOne(id);
    return this.toDto(role);
  }

  async create(dto: CreateRoleDto): Promise<RoleDto> {
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
        permissions: dto.permissions ?? [],
      },
      { persist: true },
    );

    await this.em.flush();
    return this.toDto(role);
  }

  async update(id: number, dto: UpdateRoleDto): Promise<RoleDto> {
    const role = await this.findOne(id);

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
      ...(dto.permissions !== undefined
        ? { permissions: dto.permissions }
        : {}),
    });

    await this.em.flush();
    return this.toDto(role);
  }

  async remove(id: number): Promise<void> {
    const role = await this.findOne(id);
    if (role.isDefault) {
      throw AppException.badRequest(
        ApiErrorCode.ROLE_CANNOT_DELETE_DEFAULT,
        'Cannot delete default role',
      );
    }

    this.em.remove(role);
    await this.em.flush();
  }

  toDto(role: RoleEntity): RoleDto {
    return {
      id: role.id,
      name: role.name,
      color: role.color ?? null,
      priority: role.priority,
      isDefault: role.isDefault,
      permissions: role.permissions,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    } satisfies IRole;
  }
}
