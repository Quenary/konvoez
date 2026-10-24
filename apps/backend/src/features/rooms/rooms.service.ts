import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  ApiErrorCode,
  canAccessRoomSnapshot,
  EPermission,
} from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { ensureRequestContext } from '@shared/utils/request-context.util';
import {
  FileServiceInjectionToken,
  ROOM_AVATARS_BUCKET,
  type FileService,
} from '@shared/services/file.service';
import { RoomEntity } from './rooms.entity';
import { CreateRoomDto, GetRoomDto, UpdateRoomDto } from './rooms.dto';
import {
  EntityManager,
  EntityRepository,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { RoomsDomainEvents, emitRoomsDomainEvent } from './rooms.events';
import { UserEntity } from '../users/users.entity';
import { GetUserSafeDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { PermissionsFacade } from '../permissions/permissions.facade';

@Injectable()
export class RoomsService {
  private readonly em!: EntityManager;

  constructor(
    @InjectRepository(RoomEntity)
    private readonly repo: EntityRepository<RoomEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionsFacade: PermissionsFacade,
    private readonly usersService: UsersService,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
  ) {
    this.em = this.repo.getEntityManager();
  }

  canAccessRoom(
    user:
      | GetUserSafeDto
      | UserEntity
      | {
          id: number;
          isOwner?: boolean;
          permissions?: EPermission[];
          roles?: Array<{ id: number }>;
        },
    room:
      | RoomEntity
      | GetRoomDto
      | {
          id: number;
          isPrivate?: boolean;
          allowedRoles?: unknown;
          allowedRoleIds?: number[];
          allowedUsers?: unknown;
          allowedUserIds?: number[];
        },
  ): boolean {
    const permissions =
      'permissions' in user && Array.isArray(user.permissions)
        ? user.permissions
        : [];

    let roleIds: number[] = [];
    if ('roles' in user && user.roles) {
      const userRoles: Array<{ id: number }> =
        typeof (
          user.roles as unknown as {
            getItems?: () => Array<{ id: number }>;
          }
        ).getItems === 'function'
          ? (
              user.roles as unknown as {
                getItems: () => Array<{ id: number }>;
              }
            ).getItems()
          : Array.isArray(user.roles)
            ? (user.roles as Array<{ id: number }>)
            : [];
      roleIds = userRoles.map((r) => r.id);
    }

    let allowedUserIds: number[] = [];
    if ('allowedUserIds' in room && Array.isArray(room.allowedUserIds)) {
      allowedUserIds = room.allowedUserIds;
    } else if ('allowedUsers' in room && room.allowedUsers) {
      const allowedUsers: Array<{ id: number }> =
        typeof (
          room.allowedUsers as unknown as {
            getItems?: () => Array<{ id: number }>;
          }
        ).getItems === 'function'
          ? (
              room.allowedUsers as unknown as {
                getItems: () => Array<{ id: number }>;
              }
            ).getItems()
          : Array.isArray(room.allowedUsers)
            ? (room.allowedUsers as Array<{ id: number }>)
            : [];
      allowedUserIds = allowedUsers.map((u) => u.id);
    }

    let allowedRoleIds: number[] = [];
    if ('allowedRoleIds' in room && Array.isArray(room.allowedRoleIds)) {
      allowedRoleIds = room.allowedRoleIds;
    } else if ('allowedRoles' in room && room.allowedRoles) {
      const allowedRoles: Array<{ id: number }> =
        typeof (
          room.allowedRoles as unknown as {
            getItems?: () => Array<{ id: number }>;
          }
        ).getItems === 'function'
          ? (
              room.allowedRoles as unknown as {
                getItems: () => Array<{ id: number }>;
              }
            ).getItems()
          : Array.isArray(room.allowedRoles)
            ? (room.allowedRoles as Array<{ id: number }>)
            : [];
      allowedRoleIds = allowedRoles.map((r) => r.id);
    }

    return canAccessRoomSnapshot(
      {
        id: user.id,
        isOwner: user.isOwner,
        permissions,
        roleIds,
      },
      {
        isPrivate: room.isPrivate,
        allowedUserIds,
        allowedRoleIds,
      },
    );
  }

  async findOne(id: number, author?: GetUserSafeDto): Promise<RoomEntity> {
    return ensureRequestContext(this.em, async () => {
      const room = await this.repo.findOne(
        { id },
        { populate: ['author', 'allowedRoles', 'allowedUsers'] },
      );
      if (!room) {
        throw AppException.notFound(
          ApiErrorCode.ROOM_NOT_FOUND,
          'Room not found',
        );
      }
      if (author && !this.canAccessRoom(author, room)) {
        throw AppException.forbidden(
          ApiErrorCode.ROOM_ACCESS_DENIED,
          'Access to room is denied',
        );
      }
      return room;
    });
  }

  async findOneAsSafeDto(
    id: number,
    author?: GetUserSafeDto,
  ): Promise<GetRoomDto> {
    return this.toDto(await this.findOne(id, author));
  }

  async findAll(author?: GetUserSafeDto): Promise<RoomEntity[]> {
    return ensureRequestContext(this.em, async () => {
      const rooms = await this.repo.findAll({
        populate: ['author', 'allowedRoles', 'allowedUsers'],
      });
      if (!author) {
        return rooms.filter((r) => !r.isPrivate);
      }
      return rooms.filter((r) => this.canAccessRoom(author, r));
    });
  }

  async findAllAsSafeDto(author?: GetUserSafeDto): Promise<GetRoomDto[]> {
    const rooms = await this.findAll(author);
    return rooms.map((room) => this.toDto(room));
  }

  async findPrivateRooms(): Promise<GetRoomDto[]> {
    return ensureRequestContext(this.em, async () => {
      const rooms = await this.repo.find(
        { isPrivate: true },
        { populate: ['author', 'allowedRoles', 'allowedUsers'] },
      );
      return rooms.map((room) => this.toDto(room));
    });
  }

  async create(
    dto: CreateRoomDto,
    author: GetUserSafeDto,
  ): Promise<RoomEntity> {
    return ensureRequestContext(this.em, async () => {
      const existingRoom = await this.repo.findOne({ name: dto.name });
      if (existingRoom) {
        throw AppException.conflict(
          ApiErrorCode.ROOM_NAME_TAKEN,
          'Room name already taken',
        );
      }

      const room = this.repo.create(
        {
          name: dto.name,
          type: dto.type,
          avatar: dto.avatar,
          isPrivate: dto.isPrivate ?? false,
          author: this.em.getReference(UserEntity, author.id),
        },
        { persist: true },
      );

      if (dto.allowedRoleIds?.length) {
        const roles = await this.permissionsFacade.findRolesByIds(
          dto.allowedRoleIds,
        );
        room.allowedRoles.set(roles);
      }

      if (dto.allowedUserIds?.length) {
        const users = await this.usersService.findByIds(dto.allowedUserIds);
        room.allowedUsers.set(users);
      }

      try {
        await this.em.flush();
      } catch (error) {
        if (error instanceof UniqueConstraintViolationException) {
          throw AppException.conflict(
            ApiErrorCode.ROOM_NAME_TAKEN,
            'Room name already taken',
          );
        }
        throw error;
      }

      await this.em.populate(room, ['author', 'allowedRoles', 'allowedUsers']);
      emitRoomsDomainEvent(
        this.eventEmitter,
        RoomsDomainEvents.ROOM_CREATED,
        this.toDto(room),
      );
      return room;
    });
  }

  async update(id: number, dto: UpdateRoomDto): Promise<RoomEntity> {
    return ensureRequestContext(this.em, async () => {
      const room = await this.findOne(id);

      if (dto.name) {
        const duplicateRoom = await this.repo.findOne({
          name: dto.name,
          id: { $ne: id },
        });
        if (duplicateRoom) {
          throw AppException.conflict(
            ApiErrorCode.ROOM_NAME_TAKEN,
            'Room name already taken',
          );
        }
      }

      if (dto.name !== undefined) room.name = dto.name;
      if (dto.avatar !== undefined) room.avatar = dto.avatar;
      if (dto.isPrivate !== undefined) room.isPrivate = dto.isPrivate;

      if (dto.allowedRoleIds !== undefined) {
        const roles = await this.permissionsFacade.findRolesByIds(
          dto.allowedRoleIds,
        );
        room.allowedRoles.set(roles);
      }

      if (dto.allowedUserIds !== undefined) {
        const users = await this.usersService.findByIds(dto.allowedUserIds);
        room.allowedUsers.set(users);
      }

      this.em.persist(room);

      try {
        await this.em.flush();
      } catch (error) {
        if (error instanceof UniqueConstraintViolationException) {
          throw AppException.conflict(
            ApiErrorCode.ROOM_NAME_TAKEN,
            'Room name already taken',
          );
        }
        throw error;
      }

      await this.em.populate(room, ['author', 'allowedRoles', 'allowedUsers']);
      emitRoomsDomainEvent(
        this.eventEmitter,
        RoomsDomainEvents.ROOM_UPDATED,
        this.toDto(room),
      );
      return room;
    });
  }

  async remove(id: number): Promise<void> {
    return ensureRequestContext(this.em, async () => {
      const room = await this.findOne(id);
      const avatar = room.avatar;
      this.em.remove(room);
      await this.em.flush();
      if (avatar) {
        await this.deleteStoredFile(avatar);
      }
      emitRoomsDomainEvent(this.eventEmitter, RoomsDomainEvents.ROOM_DELETED, {
        id,
      });
    });
  }

  async deleteRoomsByAuthor(authorId: number): Promise<void> {
    return ensureRequestContext(this.em, async () => {
      const rooms = await this.repo.find({ author: authorId });
      if (rooms.length === 0) {
        return;
      }
      const roomIds = rooms.map((r) => r.id);
      const avatarKeys = rooms
        .map((r) => r.avatar)
        .filter((key): key is string => Boolean(key));
      await this.em.nativeDelete(RoomEntity, { id: { $in: roomIds } });
      for (const key of avatarKeys) {
        await this.deleteStoredFile(key);
      }
      for (const roomId of roomIds) {
        emitRoomsDomainEvent(
          this.eventEmitter,
          RoomsDomainEvents.ROOM_DELETED,
          { id: roomId },
        );
      }
    });
  }

  private async deleteStoredFile(
    key: string | null | undefined,
  ): Promise<void> {
    if (!key) {
      return;
    }
    await this.fileService.delete(key, ROOM_AVATARS_BUCKET);
  }

  async findAvatarKeys(): Promise<string[]> {
    return ensureRequestContext(this.em, async () => {
      const rooms = await this.repo.find(
        { avatar: { $ne: null } },
        { fields: ['avatar'] },
      );
      return rooms
        .map((r) => r.avatar)
        .filter((key): key is string => Boolean(key));
    });
  }

  toDto(room: RoomEntity): GetRoomDto {
    const allowedRoleIds = room.allowedRoles
      ? typeof (
          room.allowedRoles as unknown as {
            getItems?: () => Array<{ id: number }>;
          }
        ).getItems === 'function'
        ? (
            room.allowedRoles as unknown as {
              getItems: () => Array<{ id: number }>;
            }
          )
            .getItems()
            .map((r) => r.id)
        : Array.isArray(room.allowedRoles)
          ? (room.allowedRoles as Array<{ id: number }>).map((r) => r.id)
          : []
      : [];

    const allowedUserIds = room.allowedUsers
      ? typeof (
          room.allowedUsers as unknown as {
            getItems?: () => Array<{ id: number }>;
          }
        ).getItems === 'function'
        ? (
            room.allowedUsers as unknown as {
              getItems: () => Array<{ id: number }>;
            }
          )
            .getItems()
            .map((u) => u.id)
        : Array.isArray(room.allowedUsers)
          ? (room.allowedUsers as Array<{ id: number }>).map((u) => u.id)
          : []
      : [];

    return {
      id: room.id,
      name: room.name,
      type: room.type,
      avatar: room.avatar,
      avatarUrl: this.getAvatarUrl(room.avatar),
      author: {
        id: room.author.id,
        username: room.author.username,
        fullname: room.author.fullname,
      },
      isPrivate: room.isPrivate ?? false,
      allowedRoleIds,
      allowedUserIds,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  getAvatarUrl(key: string | null | undefined): string | null {
    return key ? `/api/v1/rooms/avatar/stream?key=${key}` : null;
  }
}
