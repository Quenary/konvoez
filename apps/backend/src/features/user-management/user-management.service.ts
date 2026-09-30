import { randomBytes } from 'node:crypto';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, EntityRepository, FilterQuery } from '@mikro-orm/core';
import { EUserRole } from '@konvoez/shared';
import { PasswordService } from '../../shared/services/password.service';
import {
  FileServiceInjectionToken,
  ROOM_AVATARS_BUCKET,
  USER_AVATARS_BUCKET,
  type FileService,
} from '@shared/services/file.service';
import { RoomEntity } from '../rooms/rooms.entity';
import { MessageEntity } from '../text-rooms/text-rooms.entity';
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
    private readonly passwordService: PasswordService,
    @Inject(FileServiceInjectionToken)
    private readonly fileService: FileService,
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
    return this.usersService.toDto(user);
  }

  async anonymize(id: number, author: GetUserDto): Promise<GetUserDto> {
    const user = await this.load(id);
    this.assertManageableTarget(id, author, user);
    const previousAvatar = user.avatar;
    const password = await this.passwordService.hashPassword(
      randomBytes(24).toString('base64url'),
    );
    this.repo.assign(user, {
      username: `deleted-${id}`,
      fullname: 'Deleted user',
      email: `deleted-${id}@users.invalid`,
      avatar: null,
      password,
      deletedAt: user.deletedAt ?? new Date(),
    });
    this.em.persist(user);
    await this.em.flush();
    await this.deleteStoredFile(previousAvatar, USER_AVATARS_BUCKET);
    return this.usersService.toDto(user);
  }

  async removePhysically(id: number, author: GetUserDto): Promise<void> {
    const files = await this.em.transactional(async (em) => {
      const user = await em.findOne(UserEntity, { id });
      if (!user) {
        throw new NotFoundException('User not found');
      }
      this.assertManageableTarget(id, author, user);

      const rooms = await em.find(RoomEntity, { author: id });
      const roomIds = rooms.map((room) => room.id);
      const messageFilter: FilterQuery<MessageEntity>[] = [
        { sender: id },
        { recipient: id },
      ];
      if (roomIds.length > 0) {
        messageFilter.push({ room: { $in: roomIds } });
      }
      const messages = await em.find(
        MessageEntity,
        { $or: messageFilter },
        { fields: ['id'] },
      );
      const messageIds = messages.map((message) => message.id);

      if (messageIds.length > 0) {
        await em.nativeUpdate(
          MessageEntity,
          { replyToId: { $in: messageIds } },
          { replyToId: null },
        );
        await em.nativeDelete(MessageEntity, { id: { $in: messageIds } });
      }
      if (roomIds.length > 0) {
        await em.nativeDelete(RoomEntity, { id: { $in: roomIds } });
      }

      em.remove(user);
      await em.flush();

      return {
        avatar: user.avatar,
        roomAvatars: rooms.flatMap((room) =>
          room.avatar ? [room.avatar] : [],
        ),
      };
    });

    await this.deleteStoredFile(files.avatar, USER_AVATARS_BUCKET);
    for (const key of files.roomAvatars) {
      await this.deleteStoredFile(key, ROOM_AVATARS_BUCKET);
    }
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

  private async deleteStoredFile(
    key: string | null | undefined,
    bucket: string,
  ): Promise<void> {
    if (!key) {
      return;
    }
    await this.fileService.delete(key, bucket);
  }
}
