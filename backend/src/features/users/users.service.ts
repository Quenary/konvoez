import { InjectRepository } from '@mikro-orm/nestjs';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserEntity } from './users.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { EUserRole } from './users.enum';

@Injectable()
export class UsersService {
  private readonly em!: EntityManager;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: EntityRepository<UserEntity>,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async findOne(id: number): Promise<UserEntity> {
    const user = await this.repo.findOne({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOneByUsername(username: string): Promise<UserEntity> {
    const user = await this.repo.findOne({ username });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(): Promise<UserEntity[]> {
    return this.repo.findAll();
  }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const anyUser = await this.repo.findOne({});
    const role: EUserRole = !!anyUser ? EUserRole.MEMBER : EUserRole.OWNER;
    const user = this.repo.create({
      ...dto,
      role,
    });
    this.em.persist(user);
    await this.em.flush();
    return user;
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    author: UserEntity,
  ): Promise<UserEntity> {
    if (
      id !== author.id &&
      ![EUserRole.OWNER, EUserRole.ADMIN].includes(author.role)
    ) {
      throw new ForbiddenException('Forbidden');
    }
    if (dto.role == EUserRole.OWNER) {
      throw new BadRequestException('Owner role cannot be assigned');
    }
    const user = await this.findOne(id);
    this.repo.assign(user, dto);
    this.em.persist(user);
    await this.em.flush();
    return user;
  }

  async remove(id: number, author: UserEntity): Promise<void> {
    if (
      id !== author.id &&
      ![EUserRole.OWNER, EUserRole.ADMIN].includes(author.role)
    ) {
      throw new ForbiddenException('Forbidden');
    }
    const user = await this.findOne(id);
    this.em.remove(user);
    await this.em.flush();
  }
}
