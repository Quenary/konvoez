import { InjectRepository } from '@mikro-orm/nestjs';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { EUserRole } from '@konvoez/shared';
import {
  EntitySyncDomainEvents,
  emitEntitySyncDomainEvent,
} from '@shared/events/entity-sync.events';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class UserManagementService {
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: EntityRepository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async findAll(): Promise<GetUserDto[]> {
    return await this.usersService.findAllAsDto();
  }

  async findOne(id: number): Promise<GetUserDto> {
    return await this.usersService.findOneAsDto(id);
  }

  async updateRole(
    id: number,
    dto: { role?: EUserRole },
    author: GetUserDto,
  ): Promise<GetUserDto> {
    const user = await this.load(id);
    this.assertManageableTarget(id, author, user);
    if (dto.role === EUserRole.OWNER) {
      throw new BadRequestException('Owner role cannot be assigned');
    }
    if (!dto.role) {
      throw new BadRequestException('At least one field is required');
    }
    this.repo.assign(user, { role: dto.role });
    this.em.persist(user);
    await this.em.flush();
    const result = this.usersService.toDto(user);
    emitEntitySyncDomainEvent(
      this.eventEmitter,
      EntitySyncDomainEvents.USER_UPDATED,
      result,
    );
    return result;
  }

  async anonymize(id: number, author: GetUserDto): Promise<GetUserDto> {
    const user = await this.load(id);
    this.assertManageableTarget(id, author, user);
    return this.usersService.anonymizeLoaded(user);
  }

  async removePhysically(id: number, author: GetUserDto): Promise<void> {
    const user = await this.load(id);
    this.assertManageableTarget(id, author, user);
    await this.usersService.removeLoaded(id);
  }

  private async load(id: number): Promise<UserEntity> {
    const user = await this.repo.findOne({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private assertManageableTarget(
    id: number,
    author: GetUserDto,
    user: UserEntity,
  ): void {
    if (id === author.id || user.role === EUserRole.OWNER) {
      throw new ForbiddenException('Forbidden');
    }
  }
}
