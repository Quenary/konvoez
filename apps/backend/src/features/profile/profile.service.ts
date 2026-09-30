import { InjectRepository } from '@mikro-orm/nestjs';
import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { PasswordService } from '../../shared/services/password.service';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { UpdateProfileDto } from './profile.dto';

@Injectable()
export class ProfileService {
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: EntityRepository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async updateSelf(
    author: GetUserDto,
    dto: UpdateProfileDto,
  ): Promise<GetUserDto> {
    if (dto.username) {
      const existingUsername = await this.repo.findOne({
        username: dto.username,
        id: { $ne: author.id },
      });
      if (existingUsername) {
        throw new ConflictException('Username already taken');
      }
    }
    if (dto.email) {
      const existingEmail = await this.repo.findOne({
        email: dto.email,
        id: { $ne: author.id },
      });
      if (existingEmail) {
        throw new ConflictException('Email already taken');
      }
    }

    const { password, ...data } = dto;
    let assignData: Partial<UserEntity> = { ...data };
    if (password) {
      assignData = {
        ...assignData,
        password: await this.passwordService.hashPassword(password),
      };
    }

    const user = await this.usersService.findOne(author.id);
    this.repo.assign(user, assignData);
    this.em.persist(user);
    await this.em.flush();
    return this.usersService.toDto(user);
  }
}
