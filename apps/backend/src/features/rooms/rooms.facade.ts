import { Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, EPermission } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { GetUserSafeDto } from '../users/users.dto';
import { UserEntity } from '../users/users.entity';
import { GetRoomDto } from './rooms.dto';
import { RoomEntity } from './rooms.entity';
import { RoomsService } from './rooms.service';

export type TRoomAccessUser =
  | GetUserSafeDto
  | UserEntity
  | {
      id: number;
      isOwner?: boolean;
      permissions?: EPermission[];
      roles?: Array<{ id: number }>;
    };

export type TRoomAccessTarget =
  | RoomEntity
  | GetRoomDto
  | {
      id: number;
      isPrivate?: boolean;
      allowedRoles?: unknown;
      allowedRoleIds?: number[];
      allowedUsers?: unknown;
      allowedUserIds?: number[];
    };

@Injectable()
export class RoomsFacade {
  constructor(
    @Inject(RoomsService)
    private readonly roomsService: RoomsService,
  ) {}

  canAccessRoom(user: TRoomAccessUser, room: TRoomAccessTarget): boolean {
    return this.roomsService.canAccessRoom(user, room);
  }

  async canAccessRoomById(
    user: TRoomAccessUser,
    roomId: number,
  ): Promise<boolean> {
    try {
      const room = await this.roomsService.findOne(roomId);
      return this.roomsService.canAccessRoom(user, room);
    } catch {
      return false;
    }
  }

  async assertCanAccessRoom(
    user: TRoomAccessUser,
    roomId: number,
  ): Promise<RoomEntity> {
    const room = await this.roomsService.findOne(roomId);
    if (!this.roomsService.canAccessRoom(user, room)) {
      throw AppException.forbidden(
        ApiErrorCode.ROOM_ACCESS_DENIED,
        'Access to room is denied',
      );
    }
    return room;
  }

  async getAccessibleRoomIds(user: GetUserSafeDto): Promise<Set<number>> {
    const rooms = await this.roomsService.findAll(user);
    return new Set(rooms.map((room) => room.id));
  }

  async findById(id: number, author?: GetUserSafeDto): Promise<GetRoomDto> {
    return this.roomsService.findOneAsSafeDto(id, author);
  }

  async findAll(author?: GetUserSafeDto): Promise<GetRoomDto[]> {
    return this.roomsService.findAllAsSafeDto(author);
  }

  async findPrivateRooms(): Promise<GetRoomDto[]> {
    return this.roomsService.findPrivateRooms();
  }

  async deleteRoomsByAuthor(authorId: number): Promise<void> {
    await this.roomsService.deleteRoomsByAuthor(authorId);
  }

  async findAvatarKeys(): Promise<string[]> {
    return this.roomsService.findAvatarKeys();
  }
}
