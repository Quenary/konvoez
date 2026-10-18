import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorCode, EUserRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import {
  EntitySyncDomainEvents,
  emitEntitySyncDomainEvent,
} from '@shared/events/entity-sync.events';
import { PasswordService } from '../../shared/services/password.service';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { RoomsFacade } from '../rooms/rooms.facade';
import { UpdateProfileDto } from './profile.dto';

@Injectable()
export class ProfileService {
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: EntityRepository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly roomsFacade: RoomsFacade,
    private readonly passwordService: PasswordService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async updateSelf(
    author: GetUserDto,
    dto: UpdateProfileDto,
  ): Promise<GetUserDto> {
    if (dto.username) {
      const existingUsername = await this.repo.findOne({
        username: dto.username,
        id: { $ne: author.id },
      });
      if (existingUsername) {
        throw AppException.conflict(
          ApiErrorCode.AUTH_USERNAME_TAKEN,
          'Username already taken',
        );
      }
    }
    if (dto.email) {
      const existingEmail = await this.repo.findOne({
        email: dto.email,
        id: { $ne: author.id },
      });
      if (existingEmail) {
        throw AppException.conflict(
          ApiErrorCode.AUTH_EMAIL_TAKEN,
          'Email already taken',
        );
      }
    }

    const { password, ...data } = dto;
    let assignData: Partial<UserEntity> = { ...data };
    if (password) {
      assignData = {
        ...assignData,
        password: await this.passwordService.hashPassword(password),
      };
    }

    const user = await this.usersService.findOne(author.id);
    this.repo.assign(user, assignData);
    this.em.persist(user);
    await this.em.flush();
    const result = await this.usersService.toDtoWithPermissions(user);
    emitEntitySyncDomainEvent(
      this.eventEmitter,
      EntitySyncDomainEvents.USER_UPDATED,
      result,
    );
    return result;
  }

  async anonymizeSelf(author: GetUserDto): Promise<GetUserDto> {
    this.assertNotOwner(author);
    const user = await this.usersService.findOne(author.id);
    return await this.usersService.anonymizeLoaded(user);
  }

  async removeSelf(author: GetUserDto): Promise<void> {
    this.assertNotOwner(author);
    await this.roomsFacade.deleteRoomsByAuthor(author.id);
    await this.usersService.removeLoaded(author.id);
  }

  private assertNotOwner(author: GetUserDto): void {
    if (author.isOwner || author.role === EUserRole.OWNER) {
      throw AppException.forbidden(
        ApiErrorCode.USER_OWNER_DELETE_FORBIDDEN,
        'Owner account cannot be deleted',
      );
    }
  }
}
