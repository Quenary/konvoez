import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { RoomEntity } from './rooms.entity';
import { CreateRoomDto, GetRoomDto, UpdateRoomDto } from './rooms.dto';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { UserEntity } from '../users/users.entity';
import { EUserRole } from '@konvoez/shared';
import { GetUserDto } from '../users/users.dto';

@Injectable()
export class RoomsService {
  private readonly em!: EntityManager;

  constructor(
    @InjectRepository(RoomEntity)
    private readonly repo: EntityRepository<RoomEntity>,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async findOne(id: number): Promise<RoomEntity> {
    const room = await this.repo.findOne({ id });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  async findOneAsDto(id: number): Promise<GetRoomDto> {
    return this.toDto(await this.findOne(id));
  }

  async findAll(): Promise<RoomEntity[]> {
    return this.repo.findAll();
  }

  async findAllAsDto(): Promise<GetRoomDto[]> {
    const rooms = await this.findAll();
    return rooms.map((room) => this.toDto(room));
  }

  async create(dto: CreateRoomDto, author: GetUserDto): Promise<RoomEntity> {
    const room = this.repo.create(
      {
        ...dto,
        // @Author() is a DTO; reference avoids cascading a User insert without password
        author: this.em.getReference(UserEntity, author.id),
      },
      { persist: true },
    );
    await this.em.flush();
    return room;
  }

  async update(
    id: number,
    dto: UpdateRoomDto,
    author: GetUserDto,
  ): Promise<RoomEntity> {
    const room = await this.findOne(id);

    if (
      room.author.id !== author.id ||
      ![EUserRole.OWNER, EUserRole.ADMIN].includes(author.role)
    ) {
      throw new ForbiddenException(
        'Room can be deleted by the author or an admin',
      );
    }

    this.repo.assign(room, dto);
    this.em.persist(room);
    await this.em.flush();
    return room;
  }

  async remove(id: number, author: GetUserDto): Promise<void> {
    const room = await this.findOne(id);
    if (
      room.author.id !== author.id ||
      ![EUserRole.OWNER, EUserRole.ADMIN].includes(author.role)
    ) {
      throw new ForbiddenException(
        'Room can be deleted by the author or an admin',
      );
    }
    this.em.remove(room);
    await this.em.flush();
  }

  toDto(room: RoomEntity): GetRoomDto {
    return {
      id: room.id,
      name: room.name,
      type: room.type,
      avatar: room.avatar,
      avatarUrl: this.getAvatarUrl(room.avatar),
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    };
  }

  getAvatarUrl(key: string | null | undefined): string | null {
    return key ? `/api/rooms/avatar/stream?key=${key}` : null;
  }
}
