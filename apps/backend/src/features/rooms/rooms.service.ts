import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@mikro-orm/nestjs';
import { ApiErrorCode, EPermission } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { ensureRequestContext } from '@shared/utils/request-context.util';
import { RoomEntity } from './rooms.entity';
import { CreateRoomDto, GetRoomDto, UpdateRoomDto } from './rooms.dto';
import {
  EntityManager,
  EntityRepository,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import {
  EntitySyncDomainEvents,
  emitEntitySyncDomainEvent,
} from '@shared/events/entity-sync.events';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
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
  ) {
    this.em = this.repo.getEntityManager();
  }

  canAccessRoom(
    user:
      | GetUserDto
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
    if (user.isOwner) {
      return true;
    }
    const permissions =
      'permissions' in user && Array.isArray(user.permissions)
        ? user.permissions
        : [];
    if (permissions.includes(EPermission.MANAGE_ROOMS)) {
      return true;
    }
    if (!room.isPrivate) {
      return true;
    }

    if ('allowedUserIds' in room && Array.isArray(room.allowedUserIds)) {
      if (room.allowedUserIds.includes(user.id)) {
        return true;
      }
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
      if (allowedUsers.some((u: { id: number }) => u.id === user.id)) {
        return true;
      }
    }

    let allowedRoleIds: Set<number> | null = null;
    if ('allowedRoleIds' in room && Array.isArray(room.allowedRoleIds)) {
      allowedRoleIds = new Set(room.allowedRoleIds);
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
      allowedRoleIds = new Set(allowedRoles.map((r: { id: number }) => r.id));
    }

    if (allowedRoleIds && allowedRoleIds.size > 0 && user.roles) {
      const userRoles =
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
            ? user.roles
            : [];
      if (userRoles.some((r) => allowedRoleIds.has(r.id))) {
        return true;
      }
    }

    return false;
  }

  async findOne(id: number, author?: GetUserDto): Promise<RoomEntity> {
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

  async findOneAsDto(id: number, author?: GetUserDto): Promise<GetRoomDto> {
    return this.toDto(await this.findOne(id, author));
  }

  async findAll(author?: GetUserDto): Promise<RoomEntity[]> {
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

  async findAllAsDto(author?: GetUserDto): Promise<GetRoomDto[]> {
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

  async create(dto: CreateRoomDto, author: GetUserDto): Promise<RoomEntity> {
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
      emitEntitySyncDomainEvent(
        this.eventEmitter,
        EntitySyncDomainEvents.ROOM_CREATED,
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
      emitEntitySyncDomainEvent(
        this.eventEmitter,
        EntitySyncDomainEvents.ROOM_UPDATED,
        this.toDto(room),
      );
      return room;
    });
  }

  async remove(id: number): Promise<void> {
    return ensureRequestContext(this.em, async () => {
      const room = await this.findOne(id);
      this.em.remove(room);
      await this.em.flush();
      emitEntitySyncDomainEvent(
        this.eventEmitter,
        EntitySyncDomainEvents.ROOM_DELETED,
        { id },
      );
    });
  }

  async deleteRoomsByAuthor(
    authorId: number,
  ): Promise<{ roomIds: number[]; avatarKeys: string[] }> {
    return ensureRequestContext(this.em, async () => {
      const rooms = await this.repo.find({ author: authorId });
      if (rooms.length === 0) {
        return { roomIds: [], avatarKeys: [] };
      }
      const roomIds = rooms.map((r) => r.id);
      const avatarKeys = rooms
        .map((r) => r.avatar)
        .filter((key): key is string => Boolean(key));
      await this.em.nativeDelete(RoomEntity, { id: { $in: roomIds } });
      for (const roomId of roomIds) {
        emitEntitySyncDomainEvent(
          this.eventEmitter,
          EntitySyncDomainEvents.ROOM_DELETED,
          { id: roomId },
        );
      }
      return { roomIds, avatarKeys };
    });
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
