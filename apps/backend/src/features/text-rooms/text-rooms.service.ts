import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { EntityManager, EntityRepository, FilterQuery } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { MessageEntity, MessageSearchTokenEntity } from './text-rooms.entity';
import {
  EditMessageDto,
  MessageDto,
  MessageListRequestDto,
  MessageListResponseDto,
  CreateMessageDto,
} from './text-rooms.dto';
import { extractTrigrams } from '@shared/utils/trigrams.util';
import { UsersService } from '../users/users.service';
import { RoomsService } from '../rooms/rooms.service';
import { parse } from 'uuid';
import { EncryptionService } from '@shared/services/encryption.service';
import { stringify as uuidStringify } from 'uuid';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import { RoomEntity } from '../rooms/rooms.entity';
import { TextRoomsGateway } from './text-rooms.gateway';

import { ITextRoomMessageReply } from '@konvoez/shared';

@Injectable()
export class TextRoomsService {
  private get em(): EntityManager {
    return this.messageRepository.getEntityManager();
  }

  constructor(
    @InjectRepository(MessageEntity)
    private readonly messageRepository: EntityRepository<MessageEntity>,
    private readonly usersService: UsersService,
    private readonly roomsService: RoomsService,
    private readonly encryptionService: EncryptionService,
    private readonly textRoomsGateway: TextRoomsGateway,
  ) {}

  private entityToDto(data: MessageEntity): MessageDto {
    const content = this.encryptionService.decrypt(
      data.contentEncrypted,
      data.iv,
      data.authTag,
    );
    let replyTo: ITextRoomMessageReply | null = null;
    if (data.replyTo) {
      const replyContent = this.encryptionService.decrypt(
        data.replyTo.contentEncrypted,
        data.replyTo.iv,
        data.replyTo.authTag,
      );
      replyTo = {
        id: uuidStringify(data.replyTo.id),
        senderId: data.replyTo.sender.id,
        senderUsername: data.replyTo.sender.username,
        content: replyContent,
        isDeleted: false,
      };
    } else if (data.replyToId) {
      replyTo = {
        id: uuidStringify(data.replyToId),
        senderId: null,
        senderUsername: null,
        content: null,
        isDeleted: true,
      };
    }

    return {
      id: uuidStringify(data.id),
      senderId: data.sender.id,
      senderUsername: data.sender.username,
      recipientId: data.recipient?.id ?? null,
      roomId: data.room?.id ?? null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      content,
      replyTo,
    };
  }

  async getDirectChats(user: GetUserDto): Promise<GetUserDto[]> {
    const messages = await this.messageRepository.find(
      {
        room: null,
        $or: [
          { sender: user.id, recipient: { $ne: null } },
          { recipient: user.id },
        ],
      },
      {
        fields: ['sender', 'recipient', 'createdAt'],
        orderBy: { createdAt: 'DESC' },
        populate: ['sender', 'recipient'],
      },
    );

    const seenUserIds = new Set<number>();
    const users: UserEntity[] = [];

    for (const message of messages) {
      const interlocutor =
        message.sender.id === user.id ? message.recipient : message.sender;
      if (interlocutor && !seenUserIds.has(interlocutor.id)) {
        seenUserIds.add(interlocutor.id);
        users.push(interlocutor);
      }
    }

    return users.map((u) => this.usersService.toDto(u));
  }

  async list(
    user: GetUserDto,
    dto: MessageListRequestDto,
  ): Promise<MessageListResponseDto> {
    const { beforeId, afterId, aroundId, limit, recipientId, roomId, search } =
      dto;

    const baseWhere: FilterQuery<MessageEntity> = {};

    if (recipientId) {
      baseWhere.$or = [
        { sender: user.id, recipient: recipientId },
        { sender: recipientId, recipient: user.id },
      ];
    } else if (roomId) {
      baseWhere.room = roomId;
    } else {
      throw new Error('Either recipientId or chatRoomId must be provided');
    }

    if (search) {
      const trigrams = extractTrigrams(search);
      if (trigrams.length > 0) {
        const searchConditions: FilterQuery<MessageEntity>[] = trigrams.map(
          (t) =>
            ({
              searchTokens: {
                tokenHash: this.encryptionService.hashSearchToken(t),
              },
            }) as FilterQuery<MessageEntity>,
        );

        baseWhere.$and = [...(baseWhere.$and ?? []), ...searchConditions];
      }
    }

    const populate = [
      'sender',
      'recipient',
      'room',
      'replyTo',
      'replyTo.sender',
    ] as const;

    if (aroundId) {
      const target = await this.messageRepository.findOne(
        { ...baseWhere, id: parse(aroundId) },
        { populate },
      );

      if (!target) {
        return { items: [] };
      }

      const beforeLimit = Math.floor((limit - 1) / 2);
      const afterLimit = limit - 1 - beforeLimit;

      const [beforeItems, afterItems] = await Promise.all([
        beforeLimit > 0
          ? this.messageRepository.find(
              {
                ...baseWhere,
                id: { $lt: parse(aroundId) },
              } as FilterQuery<MessageEntity>,
              {
                limit: beforeLimit,
                orderBy: { createdAt: 'DESC' },
                populate,
              },
            )
          : Promise.resolve([]),
        afterLimit > 0
          ? this.messageRepository.find(
              {
                ...baseWhere,
                id: { $gt: parse(aroundId) },
              } as FilterQuery<MessageEntity>,
              {
                limit: afterLimit,
                orderBy: { createdAt: 'ASC' },
                populate,
              },
            )
          : Promise.resolve([]),
      ]);

      const combined = [...beforeItems.reverse(), target, ...afterItems];
      return {
        items: combined.map((m) => this.entityToDto(m)),
      };
    }

    const where: FilterQuery<MessageEntity> = { ...baseWhere };

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
      populate,
    });

    return {
      items: messages.map((m) => this.entityToDto(m)),
    };
  }

  async create(user: GetUserDto, dto: CreateMessageDto): Promise<MessageDto> {
    let recipient: UserEntity | null = null;
    let room: RoomEntity | null = null;

    if (dto.recipientId) {
      recipient = await this.usersService.findOne(dto.recipientId);
    }

    if (dto.roomId) {
      room = await this.roomsService.findOne(dto.roomId);
    }

    let replyToId: Uint8Array | null = null;
    let replyTarget: MessageEntity | null = null;
    if (dto.replyToId) {
      replyToId = parse(dto.replyToId);
      replyTarget = await this.messageRepository.findOne(
        { id: replyToId },
        { populate: ['sender', 'recipient', 'room'] },
      );
      if (!replyTarget) {
        throw new NotFoundException('Reply target message not found');
      }
      if (dto.roomId && replyTarget.room?.id !== dto.roomId) {
        throw new ForbiddenException(
          'Cannot reply to a message from another room',
        );
      }
      if (dto.recipientId) {
        const isDirectPair =
          (replyTarget.sender.id === user.id &&
            replyTarget.recipient?.id === dto.recipientId) ||
          (replyTarget.sender.id === dto.recipientId &&
            replyTarget.recipient?.id === user.id);
        if (!isDirectPair) {
          throw new ForbiddenException(
            'Cannot reply to a message from another chat',
          );
        }
      }
    }

    const { encrypted, iv, authTag } = this.encryptionService.encrypt(
      dto.content,
    );

    const message = this.messageRepository.create(
      {
        // @Author() is a DTO; reference avoids cascading a User insert without password
        sender: this.em.getReference(UserEntity, user.id),
        recipient,
        room,
        replyToId,
        contentEncrypted: encrypted,
        iv,
        authTag,
      },
      { persist: true },
    );
    if (replyTarget) {
      message.replyTo = replyTarget;
    }

    this.indexSearchTokens(message, dto.content);

    await this.em.flush();

    await this.em.populate(message, ['sender', 'replyTo', 'replyTo.sender']);
    if (replyTarget) {
      message.replyTo = replyTarget;
    }
    const messageDto = this.entityToDto(message);
    this.textRoomsGateway.onMessageCreated(messageDto);
    return messageDto;
  }

  async updateMessage(
    user: GetUserDto,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<MessageDto> {
    let message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender', 'replyTo', 'replyTo.sender'] },
    );

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.sender.id !== user.id) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    const { encrypted, iv, authTag } = this.encryptionService.encrypt(
      dto.content,
    );

    message = this.messageRepository.assign(message, {
      contentEncrypted: encrypted,
      iv,
      authTag,
    });

    await this.em.nativeDelete(MessageSearchTokenEntity, {
      message: message.id,
    });
    this.indexSearchTokens(message, dto.content);

    this.em.persist(message);
    await this.em.flush();

    const messageDto = this.entityToDto(message);
    this.textRoomsGateway.onMessageUpdated(messageDto);
    return messageDto;
  }

  async delete(user: GetUserDto, messageId: string): Promise<void> {
    const message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender'] },
    );

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.sender.id !== user.id) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    this.em.remove(message);
    await this.em.flush();

    this.textRoomsGateway.onMessageDeleted(messageId);
  }

  private indexSearchTokens(message: MessageEntity, content: string): void {
    const trigrams = extractTrigrams(content);
    trigrams.forEach((t) => {
      const tokenHash = this.encryptionService.hashSearchToken(t);
      const tokenEntity = this.em.create(MessageSearchTokenEntity, {
        tokenHash,
        message,
      });
      message.searchTokens.add(tokenEntity);
    });
  }
}
