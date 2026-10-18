import { randomBytes } from 'node:crypto';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, EntityRepository, FilterQuery } from '@mikro-orm/core';
import { ApiErrorCode, EPermission } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { ensureRequestContext } from '@shared/utils/request-context.util';
import { PasswordService } from '../../shared/services/password.service';
import {
  FileServiceInjectionToken,
  ROOM_AVATARS_BUCKET,
  USER_AVATARS_BUCKET,
  type FileService,
} from '@shared/services/file.service';
import {
  EntitySyncDomainEvents,
  emitEntitySyncDomainEvent,
} from '@shared/events/entity-sync.events';
import { RoomEntity } from '../rooms/rooms.entity';
import { MessageEntity } from '../text-rooms/text-rooms.entity';
import { UserEntity } from './users.entity';
import { GetUserDto } from './users.dto';
import { PermissionsFacade } from '../permissions/permissions.facade';
import type { RoleEntity } from '../roles/roles.entity';

@Injectable()
export class UsersService {
  private readonly em!: EntityManager;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: EntityRepository<UserEntity>,
    private readonly passwordService: PasswordService,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionsFacade: PermissionsFacade,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async findOne(id: number): Promise<UserEntity> {
    return ensureRequestContext(this.em, async () => {
      const user = await this.repo.findOne({ id }, { populate: ['roles'] });
      if (!user) {
        throw AppException.notFound(
          ApiErrorCode.USER_NOT_FOUND,
          'User not found',
        );
      }
      return user;
    });
  }

  async findOneAsDto(id: number): Promise<GetUserDto> {
    const user = await this.findOne(id);
    return this.toDtoWithPermissions(user);
  }

  async findOneBy(where: Partial<UserEntity>): Promise<UserEntity> {
    const em = this.em.fork();
    const user = await em.findOne(UserEntity, where, { populate: ['roles'] });
    if (!user) {
      throw AppException.notFound(
        ApiErrorCode.USER_NOT_FOUND,
        'User not found',
      );
    }
    return user;
  }

  async findOneByUsernameOrEmail(login: string): Promise<UserEntity> {
    const em = this.em.fork();
    const user = await em.findOne(
      UserEntity,
      {
        $or: [{ username: login }, { email: login.toLowerCase() }],
      },
      { populate: ['roles'] },
    );
    if (!user) {
      throw AppException.notFound(
        ApiErrorCode.USER_NOT_FOUND,
        'User not found',
      );
    }
    return user;
  }

  async findOneByAsDto(where: Partial<UserEntity>): Promise<GetUserDto> {
    const user = await this.findOneBy(where);
    return this.toDtoWithPermissions(user);
  }

  async findAll(): Promise<UserEntity[]> {
    return ensureRequestContext(this.em, async () => {
      return this.repo.findAll({ populate: ['roles'] });
    });
  }

  async findAllAsDto(): Promise<GetUserDto[]> {
    const users = await this.findAll();
    return Promise.all(users.map((user) => this.toDtoWithPermissions(user)));
  }

  async findByIds(ids: number[]): Promise<UserEntity[]> {
    return ensureRequestContext(this.em, async () => {
      if (!ids.length) {
        return [];
      }
      return this.repo.find({ id: { $in: ids } });
    });
  }

  async updateUserRoles(
    user: UserEntity,
    roles: RoleEntity[],
  ): Promise<UserEntity> {
    return ensureRequestContext(this.em, async () => {
      user.roles.set(roles);
      this.em.persist(user);
      await this.em.flush();
      return user;
    });
  }

  async count(): Promise<number> {
    const em = this.em.fork();
    return em.count(UserEntity);
  }

  async setPassword(userId: number, password: string): Promise<UserEntity> {
    return ensureRequestContext(this.em, async () => {
      const user = await this.findOne(userId);
      const passwordHash = await this.passwordService.hashPassword(password);
      this.repo.assign(user, { password: passwordHash });
      this.em.persist(user);
      await this.em.flush();
      return user;
    });
  }

  async anonymizeLoaded(user: UserEntity): Promise<GetUserDto> {
    const previousAvatar = user.avatar;
    const password = await this.passwordService.hashPassword(
      randomBytes(24).toString('base64url'),
    );
    this.repo.assign(user, {
      username: `deleted-${user.id}`,
      fullname: 'Deleted user',
      email: `deleted-${user.id}@users.invalid`,
      avatar: null,
      password,
      deletedAt: user.deletedAt ?? new Date(),
    });
    this.em.persist(user);
    await this.em.flush();
    await this.deleteStoredFile(previousAvatar, USER_AVATARS_BUCKET);
    const result = this.toDto(user);
    emitEntitySyncDomainEvent(
      this.eventEmitter,
      EntitySyncDomainEvents.USER_UPDATED,
      result,
    );
    return result;
  }

  async removeLoaded(id: number): Promise<void> {
    const files = await this.em.transactional(async (em) => {
      const user = await em.findOne(UserEntity, { id });
      if (!user) {
        throw AppException.notFound(
          ApiErrorCode.USER_NOT_FOUND,
          'User not found',
        );
      }

      const rooms = await em.find(RoomEntity, { author: id });
      const roomIds = rooms.map((room) => room.id);
      const messageFilter: FilterQuery<MessageEntity>[] = [
        { sender: id },
        { recipient: id },
      ];
      if (roomIds.length > 0) {
        messageFilter.push({ room: { $in: roomIds } });
      }
      const messages = await em.find(
        MessageEntity,
        { $or: messageFilter },
        { fields: ['id'] },
      );
      const messageIds = messages.map((message) => message.id);

      if (messageIds.length > 0) {
        await em.nativeUpdate(
          MessageEntity,
          { replyToId: { $in: messageIds } },
          { replyToId: null },
        );
        await em.nativeDelete(MessageEntity, { id: { $in: messageIds } });
      }
      if (roomIds.length > 0) {
        await em.nativeDelete(RoomEntity, { id: { $in: roomIds } });
      }

      em.remove(user);
      await em.flush();

      return {
        avatar: user.avatar,
        roomIds,
        roomAvatars: rooms.flatMap((room) =>
          room.avatar ? [room.avatar] : [],
        ),
      };
    });

    await this.deleteStoredFile(files.avatar, USER_AVATARS_BUCKET);
    for (const key of files.roomAvatars) {
      await this.deleteStoredFile(key, ROOM_AVATARS_BUCKET);
    }
    for (const roomId of files.roomIds) {
      emitEntitySyncDomainEvent(
        this.eventEmitter,
        EntitySyncDomainEvents.ROOM_DELETED,
        { id: roomId },
      );
    }
    emitEntitySyncDomainEvent(
      this.eventEmitter,
      EntitySyncDomainEvents.USER_DELETED,
      { id },
    );
  }

  toDto(user: UserEntity, permissions?: EPermission[]): GetUserDto {
    const roles = user.roles?.isInitialized?.()
      ? user.roles.getItems().map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color ?? null,
          priority: r.priority,
        }))
      : [];

    const effectivePermissions =
      permissions ?? (user.isOwner ? Object.values(EPermission) : []);

    return {
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      email: user.email,
      isOwner: user.isOwner,
      roles,
      permissions: effectivePermissions,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      avatar: user.avatar,
      avatarUrl: this.getAvatarUrl(user.avatar),
      deletedAt: user.deletedAt ?? null,
    };
  }

  async toDtoWithPermissions(user: UserEntity): Promise<GetUserDto> {
    if (!user.roles?.isInitialized?.()) {
      await this.em.populate(user, ['roles']);
    }
    const permissions = await this.permissionsFacade.getUserPermissions(user);
    return this.toDto(user, permissions);
  }

  getAvatarUrl(key: string | null | undefined): string | null {
    return key ? `/api/v1/users/avatar/stream?key=${key}` : null;
  }

  private async deleteStoredFile(
    key: string | null | undefined,
    bucket: string,
  ): Promise<void> {
    if (!key) {
      return;
    }
    await this.fileService.delete(key, bucket);
  }
}
