import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorCode } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import {
  EntitySyncDomainEvents,
  emitEntitySyncDomainEvent,
} from '@shared/events/entity-sync.events';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { PermissionsFacade } from '../permissions/permissions.facade';
import { UserManagementUpdateDto } from './user-management.dto';

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
    dto: UserManagementUpdateDto,
    author: GetUserDto,
  ): Promise<GetUserDto> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);

    const roles = await this.permissionsFacade.findRolesByIds(dto.roleIds);
    await this.usersService.updateUserRoles(user, roles);

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
