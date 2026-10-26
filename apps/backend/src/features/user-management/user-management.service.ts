import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorCode } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { UsersDomainEvents, emitUsersDomainEvent } from '../users/users.events';

import { UserEntity } from '../users/users.entity';
import { GetUserSafeDto, GetUserFullDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { PermissionsFacade } from '../permissions/permissions.facade';
import { RoomsFacade } from '../rooms/rooms.facade';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { UserManagementUpdateDto } from './user-management.dto';

@Injectable()
export class UserManagementService {
  constructor(
    private readonly usersService: UsersService,
    private readonly permissionsFacade: PermissionsFacade,
    private readonly roomsFacade: RoomsFacade,
    private readonly twoFactorService: TwoFactorService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<GetUserFullDto[]> {
    return await this.usersService.findAllAsFullDto();
  }

  async findOne(id: number): Promise<GetUserFullDto> {
    return await this.usersService.findOneAsFullDto(id);
  }

  async updateRole(
    id: number,
    dto: UserManagementUpdateDto,
    author: GetUserSafeDto,
  ): Promise<GetUserFullDto> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);

    const uniqueRoleIds = [...new Set(dto.roleIds)];
    const roles = await this.permissionsFacade.findRolesByIds(uniqueRoleIds);
    if (roles.length !== uniqueRoleIds.length) {
      throw AppException.notFound(
        ApiErrorCode.ROLE_NOT_FOUND,
        'One or more roles not found',
      );
    }
    for (const role of roles) {
      this.permissionsFacade.assertCanManageRole(author, role.priority);
      await this.permissionsFacade.assertCanGrantPermissions(
        author,
        role.permissions,
      );
    }
    await this.usersService.updateUserRoles(user, roles);

    const publicDto = await this.usersService.toSafeDtoWithPermissions(user);
    emitUsersDomainEvent(
      this.eventEmitter,
      UsersDomainEvents.USER_UPDATED,
      publicDto,
    );
    emitUsersDomainEvent(
      this.eventEmitter,
      UsersDomainEvents.USER_PERMISSIONS_CHANGED,
      { userIds: [id] },
    );
    return this.usersService.toFullDto(user, publicDto.permissions);
  }

  async anonymize(id: number, author: GetUserSafeDto): Promise<GetUserFullDto> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);
    return this.usersService.anonymizeLoaded(user);
  }

  async removePhysically(id: number, author: GetUserSafeDto): Promise<void> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);
    await this.roomsFacade.deleteRoomsByAuthor(id);
    await this.usersService.removeLoaded(id);
  }

  async resetTwoFactor(
    id: number,
    author: GetUserSafeDto,
  ): Promise<GetUserFullDto> {
    const user = await this.usersService.findOne(id);
    this.assertManageableTarget(id, author, user);
    if (user.deletedAt) {
      throw AppException.notFound(
        ApiErrorCode.USER_NOT_FOUND,
        'User not found',
      );
    }
    return await this.twoFactorService.adminReset(user, author.id);
  }

  private assertManageableTarget(
    id: number,
    author: GetUserSafeDto,
    user: UserEntity,
  ): void {
    if (id === author.id || user.isOwner) {
      throw AppException.forbidden(ApiErrorCode.FORBIDDEN, 'Forbidden');
    }
    this.permissionsFacade.assertCanManageUser(author, user);
  }
}
