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
import { CreateUserDto, GetUserDto, UpdateUserDto } from './users.dto';
import { EUserRole } from '@konvoez/shared';
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

  async findOneAsDto(id: number): Promise<GetUserDto> {
    const user = await this.findOne(id);
    return this.toDto(user);
  }

  async findOneBy(where: Partial<UserEntity>): Promise<UserEntity> {
    const em = this.em.fork();
    const user = await em.findOne(UserEntity, where);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findOneByAsDto(where: Partial<UserEntity>): Promise<GetUserDto> {
    const user = await this.findOneBy(where);
    return this.toDto(user);
  }

  async findAll(): Promise<UserEntity[]> {
    return this.repo.findAll();
  }

  async findAllAsDto(): Promise<GetUserDto[]> {
    const users = await this.findAll();
    return users.map(this.toDto);
  }

  async create(dto: CreateUserDto): Promise<UserEntity> {
    const existing = await this.repo.findOne({ username: dto.username });
    if (existing) {
      throw new ConflictException('Username already taken');
    }
    const anyUser = (await this.em.count(UserEntity)) > 0;
    // Owner role is only for the first user
    const role: EUserRole = anyUser ? EUserRole.MEMBER : EUserRole.OWNER;
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
    author: GetUserDto,
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
    const { password, ...data } = dto;
    if (password) {
      const passwordHash = await this.passwordService.hashPassword(password);
      dto = {
        ...data,
        password: passwordHash,
      };
    }
    const user = await this.findOne(id);
    this.repo.assign(user, dto);
    this.em.persist(user);
    await this.em.flush();
    return user;
  }

  async remove(id: number, author: GetUserDto): Promise<void> {
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

  toDto(user: UserEntity): GetUserDto {
    return {
      id: user.id,
      username: user.username,
      fullname: user.fullname,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      avatar: user.avatar,
      avatarUrl: this.getAvatarUrl(user.avatar),
    };
  }

  getAvatarUrl(key: string | null | undefined): string | null {
    return key ? `/api/users/avatar/stream?key=${key}` : null;
  }
}
