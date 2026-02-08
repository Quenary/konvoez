import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { RoomEntity } from './rooms.entity';
import { CreateRoomDto, UpdateRoomDto } from './rooms.dto';
import { EntityManager, EntityRepository } from '@mikro-orm/core';

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

  async create(dto: CreateRoomDto): Promise<RoomEntity> {
    const room = this.repo.create(dto);
    this.em.persist(room);
    await this.em.flush();
    return room;
  }

  async update(id: number, dto: UpdateRoomDto): Promise<RoomEntity> {
    const room = await this.findOne(id);
    this.repo.assign(room, dto);
    this.em.persist(room);
    await this.em.flush();
    return room;
  }

  async remove(id: number): Promise<void> {
    const room = await this.findOne(id);
    this.em.remove(room);
    await this.em.flush();
  }
}
