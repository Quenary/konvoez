import { InjectRepository } from '@mikro-orm/nestjs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserEntity } from './users.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { CreateUserDto, UpdateUserDto } from './users.dto';
import { EUserRole } from '@common/enums';
import { PasswordService } from '../../shared/services/password.service';

@Injectable()
export class UsersService {
  private readonly em!: EntityManager;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: EntityRepository<UserEntity>,
    private readonly passwordService: PasswordService,
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

  async forkOneBy(where: Partial<UserEntity>): Promise<UserEntity> {
    const em = this.em.fork();
    const user = await em.findOne(UserEntity, where);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findAll(): Promise<UserEntity[]> {
    return this.repo.findAll();
  }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const existing = await this.repo.findOne({ username: dto.username });
    if (existing) {
      throw new ConflictException('Username already taken');
    }
    const anyUser = (await this.em.count(UserEntity)) > 0;
    // Owner role is only for the first user
    const role: EUserRole = !!anyUser ? EUserRole.MEMBER : EUserRole.OWNER;
    const password = await this.passwordService.hashPassword(dto.password);
    const user = this.repo.create(
      {
        ...dto,
        password,
        role,
      },
      { persist: true },
    );
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
    let { password, ...data } = dto;
    if (password) {
      password = await this.passwordService.hashPassword(password);
      dto = {
        ...data,
        password,
      };
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
