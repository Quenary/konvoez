import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorCode, EUserRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import {
  EntitySyncDomainEvents,
  emitEntitySyncDomainEvent,
} from '@shared/events/entity-sync.events';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { PermissionsFacade } from '../permissions/permissions.facade';

@Injectable()
export class UserManagementService {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsFacade: PermissionsFacade,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<GetUserDto[]> {
    return await this.usersService.findAllAsDto();
  }

  async findOne(id: number): Promise<GetUserDto> {
    return await this.usersService.findOneAsDto(id);
  }

  async updateRole(
    id: number,
    dto: { roleIds?: number[]; role?: EUserRole },
    author: GetUserDto,
  ): Promise<GetUserDto> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);

    if (dto.role === EUserRole.OWNER) {
      throw AppException.badRequest(
        ApiErrorCode.USER_OWNER_ROLE_FORBIDDEN,
        'Owner role cannot be assigned',
      );
    }

    if (dto.roleIds !== undefined) {
      const roles = await this.permissionsFacade.findRolesByIds(dto.roleIds);
      await this.usersService.updateUserRoles(user, roles);
    }

    if (!dto.role && dto.roleIds === undefined) {
      throw AppException.badRequest(
        ApiErrorCode.USER_UPDATE_EMPTY,
        'At least one field is required',
      );
    }

    const result = await this.usersService.toDtoWithPermissions(user);
    emitEntitySyncDomainEvent(
      this.eventEmitter,
      EntitySyncDomainEvents.USER_UPDATED,
      result,
    );
    return result;
  }

  async anonymize(id: number, author: GetUserDto): Promise<GetUserDto> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);
    return this.usersService.anonymizeLoaded(user);
  }

  async removePhysically(id: number, author: GetUserDto): Promise<void> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);
    await this.usersService.removeLoaded(id);
  }

  private assertManageableTarget(
    id: number,
    author: GetUserDto,
    user: UserEntity,
  ): void {
    if (id === author.id || user.isOwner) {
      throw AppException.forbidden(ApiErrorCode.FORBIDDEN, 'Forbidden');
    }
  }
}
