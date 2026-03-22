import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EntityManager, EntityRepository, FilterQuery } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { MessageEntity } from './text-rooms.entity';
import { UserEntity } from '../users/users.entity';
import { RoomEntity } from '../rooms/rooms.entity';
import {
  EditMessageDto,
  MessageDto,
  MessageListRequestDto,
  MessageListResponseDto,
  CreateMessageDto,
} from './text-rooms.dto';
import { UsersService } from '../users/users.service';
import { RoomsService } from '../rooms/rooms.service';
import { parse } from 'uuid';

@Injectable()
export class TextRoomsService {
  private readonly em!: EntityManager;

  constructor(
    @InjectRepository(MessageEntity)
    private readonly messageRepository: EntityRepository<MessageEntity>,
    private readonly usersService: UsersService,
    private readonly roomsService: RoomsService,
  ) {
    this.em = this.messageRepository.getEntityManager();
  }

  async list(
    user: UserEntity,
    dto: MessageListRequestDto,
  ): Promise<MessageListResponseDto> {
    const { beforeId, afterId, limit, recipientId, roomId } = dto;

    const where: FilterQuery<MessageEntity> = {};

    if (recipientId) {
      where.$or = [
        { sender: user.id, recipient: recipientId },
        { sender: recipientId, recipient: user.id },
      ];
    } else if (roomId) {
      where.room = roomId;
    } else {
      throw new Error('Either recipientId or chatRoomId must be provided');
    }

    if (beforeId) {
      where.id = { $lt: parse(beforeId) };
    }

    if (afterId) {
      where.id = { $gt: parse(afterId) };
    }

    const orderBy = afterId ? { createdAt: 'ASC' } : { createdAt: 'DESC' };

    const messages = await this.messageRepository.find(where, {
      limit,
      orderBy,
      populate: ['sender', 'recipient', 'room'],
    });

    return {
      items: messages.map((m) => MessageDto.fromEntity(m)),
    };
  }

  async create(user: UserEntity, dto: CreateMessageDto): Promise<MessageDto> {
    let recipient: UserEntity | null = null;
    let room: RoomEntity | null = null;

    if (dto.recipientId) {
      recipient = await this.usersService.findOne(dto.recipientId);
    }

    if (dto.roomId) {
      room = await this.roomsService.findOne(dto.roomId);
    }

    const message = this.messageRepository.create(
      {
        sender: user,
        recipient,
        room,
        content: dto.content,
      },
      { persist: true },
    );
    await this.em.flush();
    return MessageDto.fromEntity(message);
  }

  async updateMessage(
    user: UserEntity,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<MessageDto> {
    let message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender'] },
    );

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.sender.id !== user.id) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    message = this.messageRepository.assign(message, {
      content: dto.content,
    });

    this.em.persist(message);
    await this.em.flush();
    return MessageDto.fromEntity(message);
  }

  async delete(user: UserEntity, messageId: string): Promise<void> {
    const message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender'] },
    );

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Только автор может удалить сообщение
    if (message.sender.id !== user.id) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    this.em.remove(message);
    await this.em.flush();
  }
}
