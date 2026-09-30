import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { PasswordService } from '../../shared/services/password.service';
import { UserEntity } from './users.entity';
import { GetUserDto } from './users.dto';

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

  async findOneByUsernameOrEmail(login: string): Promise<UserEntity> {
    const em = this.em.fork();
    const user = await em.findOne(UserEntity, {
      $or: [{ username: login }, { email: login.toLowerCase() }],
    });
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
    return users.map((user) => this.toDto(user));
  }

  async count(): Promise<number> {
    const em = this.em.fork();
    return em.count(UserEntity);
  }

  async setPassword(userId: number, password: string): Promise<UserEntity> {
    const user = await this.findOne(userId);
    const passwordHash = await this.passwordService.hashPassword(password);
    this.repo.assign(user, { password: passwordHash });
    this.em.persist(user);
    await this.em.flush();
    return user;
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
      deletedAt: user.deletedAt ?? null,
    };
  }

  getAvatarUrl(key: string | null | undefined): string | null {
    return key ? `/api/v1/users/avatar/stream?key=${key}` : null;
  }
}
