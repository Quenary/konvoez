import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorCode, EUserRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { UsersDomainEvents, emitUsersDomainEvent } from '../users/users.events';
import { UserEntity } from '../users/users.entity';
import { GetUserSafeDto, GetUserFullDto } from '../users/users.dto';
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
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async updateSelf(
    author: GetUserSafeDto,
    dto: UpdateProfileDto,
  ): Promise<{ user: GetUserFullDto; sessionVersion?: number }> {
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
    const user = await this.usersService.findOne(author.id);
    this.repo.assign(user, data);

    let sessionVersion: number | undefined;
    if (password) {
      await this.usersService.setPassword(user, password);
      sessionVersion = user.sessionVersion;
    } else {
      this.em.persist(user);
      await this.em.flush();
    }

    const publicDto = await this.usersService.toSafeDtoWithPermissions(user);
    emitUsersDomainEvent(
      this.eventEmitter,
      UsersDomainEvents.USER_UPDATED,
      publicDto,
    );
    return {
      user: this.usersService.toFullDto(user, publicDto.permissions),
      sessionVersion,
    };
  }

  async anonymizeSelf(author: GetUserSafeDto): Promise<GetUserFullDto> {
    this.assertNotOwner(author);
    const user = await this.usersService.findOne(author.id);
    return await this.usersService.anonymizeLoaded(user);
  }

  async removeSelf(author: GetUserSafeDto): Promise<void> {
    this.assertNotOwner(author);
    await this.roomsFacade.deleteRoomsByAuthor(author.id);
    await this.usersService.removeLoaded(author.id);
  }

  private assertNotOwner(author: GetUserSafeDto): void {
    if (author.isOwner || author.role === EUserRole.OWNER) {
      throw AppException.forbidden(
        ApiErrorCode.USER_OWNER_DELETE_FORBIDDEN,
        'Owner account cannot be deleted',
      );
    }
  }
}
