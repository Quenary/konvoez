import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { RoomEntity } from './rooms.entity';
import { CreateRoomDto, UpdateRoomDto } from './rooms.dto';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { UserEntity } from '../users/users.entity';
import { EUserRole } from '../users/users.enum';

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
  async findAll(): Promise<RoomEntity[]> {
    return this.repo.findAll();
  }

  async create(dto: CreateRoomDto, author: UserEntity): Promise<RoomEntity> {
    const room = this.repo.create({
      ...dto,
      author,
    });
    this.em.persist(room);
    await this.em.flush();
    return room;
  }

  async update(
    id: number,
    dto: UpdateRoomDto,
    author: UserEntity,
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

  async remove(id: number, author: UserEntity): Promise<void> {
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
}
