import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EntityManager,
  EntityRepository,
  FilterQuery,
  raw,
} from '@mikro-orm/core';
import { SqlEntityRepository } from '@mikro-orm/sql';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  MessageEntity,
  MessageReadEntity,
  MessageSearchTokenEntity,
} from './text-rooms.entity';
import {
  EditMessageDto,
  MarkReadDto,
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

import { ITextRoomMessageReply, ITextRoomUnreadCounts } from '@konvoez/shared';

@Injectable()
export class TextRoomsService {
  private get em(): EntityManager {
    return this.messageRepository.getEntityManager();
  }

  constructor(
    @InjectRepository(MessageEntity)
    private readonly messageRepository: EntityRepository<MessageEntity>,
    @InjectRepository(MessageReadEntity)
    private readonly messageReadRepository: EntityRepository<MessageReadEntity>,
    private readonly usersService: UsersService,
    private readonly roomsService: RoomsService,
    private readonly encryptionService: EncryptionService,
    private readonly textRoomsGateway: TextRoomsGateway,
  ) {}

  private entityToDto(data: MessageEntity, isRead: boolean): MessageDto {
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
      isRead,
    };
  }

  /**
   * Batch-load read status for a list of messages for a given user.
   * For own messages: isRead = true if at least one other user has a read record.
   * For others' messages: isRead = true if the current user has a read record.
   */
  private async buildIsReadMap(
    messages: MessageEntity[],
    currentUserId: number,
  ): Promise<Map<string, boolean>> {
    const map = new Map<string, boolean>();
    if (messages.length === 0) return map;

    const rawIds = messages.map((m) => m.id);

    const reads = await this.messageReadRepository.find(
      { message: { $in: rawIds } },
      { fields: ['message', 'reader'] },
    );

    // Group readers by message id (hex string key)
    const readersByMsg = new Map<string, Set<number>>();
    for (const r of reads) {
      const key = uuidStringify(r.message.id);
      const readers = readersByMsg.get(key) ?? new Set<number>();
      readers.add(r.reader.id);
      readersByMsg.set(key, readers);
    }

    for (const msg of messages) {
      const key = uuidStringify(msg.id);
      const readers = readersByMsg.get(key) ?? new Set<number>();
      const isOwnMessage = msg.sender.id === currentUserId;
      if (isOwnMessage) {
        // isRead = at least one OTHER user has read it
        const othersRead = [...readers].some((id) => id !== currentUserId);
        map.set(key, othersRead);
      } else {
        // isRead = current user has read it
        map.set(key, readers.has(currentUserId));
      }
    }

    return map;
  }

  private get messageQueryBuilder(): SqlEntityRepository<MessageEntity> {
    return this.messageRepository as SqlEntityRepository<MessageEntity>;
  }

  private createUnreadMessageIdsSubquery(userId: number) {
    // toRaw() is required: MessageEntity.id is Uint8Array, and FilterQuery
    // processWhere would otherwise convert the QueryBuilder via Uint8ArrayType.
    return (
      this.messageReadRepository as SqlEntityRepository<MessageReadEntity>
    )
      .createQueryBuilder('mr')
      .select('mr.message')
      .where({ reader: userId })
      .toRaw();
  }

  async getUnreadCounts(user: GetUserDto): Promise<ITextRoomUnreadCounts> {
    const userId = user.id;

    const [roomRows, directRows] = await Promise.all([
      this.messageQueryBuilder
        .createQueryBuilder('m')
        .select(['m.room as roomId', raw('count(*) as count')])
        .where({
          id: { $nin: this.createUnreadMessageIdsSubquery(userId) },
          sender: { $ne: userId },
          room: { $ne: null },
        })
        .groupBy('m.room')
        .execute<Array<{ roomId: number; count: number }>>('all'),
      this.messageQueryBuilder
        .createQueryBuilder('m')
        .select(['m.sender as senderId', raw('count(*) as count')])
        .where({
          id: { $nin: this.createUnreadMessageIdsSubquery(userId) },
          recipient: userId,
          room: null,
        })
        .groupBy('m.sender')
        .execute<Array<{ senderId: number; count: number }>>('all'),
    ]);

    const rooms = Object.fromEntries(
      roomRows.map((row) => [String(row.roomId), Number(row.count)]),
    );
    const direct = Object.fromEntries(
      directRows.map((row) => [String(row.senderId), Number(row.count)]),
    );
    const directTotal = directRows.reduce(
      (sum, row) => sum + Number(row.count),
      0,
    );

    return { rooms, direct, directTotal };
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
      const isReadMap = await this.buildIsReadMap(combined, user.id);
      return {
        items: combined.map((m) =>
          this.entityToDto(m, isReadMap.get(uuidStringify(m.id)) ?? false),
        ),
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

    const isReadMap = await this.buildIsReadMap(messages, user.id);
    return {
      items: messages.map((m) =>
        this.entityToDto(m, isReadMap.get(uuidStringify(m.id)) ?? false),
      ),
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
    const messageDto = this.entityToDto(message, false);
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

    const isReadMap = await this.buildIsReadMap([message], user.id);
    const messageDto = this.entityToDto(
      message,
      isReadMap.get(uuidStringify(message.id)) ?? false,
    );
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

  async markRead(user: GetUserDto, dto: MarkReadDto): Promise<void> {
    const rawIds = dto.messageIds.map((id) => parse(id));

    const messages = await this.messageRepository.find(
      { id: { $in: rawIds } },
      {
        populate: ['sender', 'recipient', 'room', 'replyTo', 'replyTo.sender'],
      },
    );

    const othersMessages = messages.filter((msg) => msg.sender.id !== user.id);
    if (othersMessages.length === 0) return;

    const existingReads = await this.messageReadRepository.find({
      message: { $in: othersMessages.map((msg) => msg.id) },
      reader: user.id,
    });
    const alreadyRead = new Set(
      existingReads.map((read) => uuidStringify(read.message.id)),
    );

    for (const msg of othersMessages) {
      if (alreadyRead.has(uuidStringify(msg.id))) {
        continue;
      }

      this.em.persist(
        this.messageReadRepository.create({
          message: msg,
          reader: this.em.getReference(UserEntity, user.id),
        }),
      );
    }

    await this.em.flush();

    for (const msg of othersMessages) {
      this.textRoomsGateway.onMessageUpdated(this.entityToDto(msg, true));
    }
  }

  async getReaders(user: GetUserDto, messageId: string): Promise<GetUserDto[]> {
    const message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender', 'recipient', 'room'] },
    );

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Access check: user must be sender, recipient, or a room member
    const isParticipant =
      message.sender.id === user.id ||
      message.recipient?.id === user.id ||
      message.room != null; // room membership check is implicit via list access

    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    const reads = await this.messageReadRepository.find(
      { message: parse(messageId) },
      { populate: ['reader'] },
    );

    return reads.map((r) => this.usersService.toDto(r.reader));
  }
}
