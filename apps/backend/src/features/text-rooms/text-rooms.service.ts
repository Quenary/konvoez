import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  EntityManager,
  EntityRepository,
  FilterQuery,
  raw,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { SqlEntityRepository } from '@mikro-orm/sql';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  MessageEntity,
  MessageReadEntity,
  MessageReactionEntity,
  MessageSearchTokenEntity,
} from './text-rooms.entity';
import {
  EditMessageDto,
  MarkReadDto,
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
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TextRoomDomainEvents,
  emitTextRoomDomainEvent,
} from '@shared/events/text-room.events';
import {
  NotificationsDomainEvents,
  emitNotificationsDomainEvent,
} from '@shared/events/notifications.events';

import {
  canDeleteTextRoomMessage,
  ESettingKey,
  IAttachment,
  ITextRoomMessage,
  ITextRoomMessageReply,
  ITextRoomReactionGroup,
  ITextRoomUnreadCounts,
  SCHEMA_ERROR,
} from '@konvoez/shared';
import { htmlToPlainText } from '@shared/utils/html-text.util';
import { AttachmentsService } from '../attachments/attachments.service';
import { SettingsService } from '../settings/settings.service';

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
    @InjectRepository(MessageReactionEntity)
    private readonly messageReactionRepository: EntityRepository<MessageReactionEntity>,
    private readonly usersService: UsersService,
    private readonly roomsService: RoomsService,
    private readonly encryptionService: EncryptionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly attachmentsService: AttachmentsService,
    private readonly settingsService: SettingsService,
  ) {}

  private entityToDto(
    data: MessageEntity,
    isRead: boolean,
    attachments: readonly IAttachment[] = [],
    reactions: readonly ITextRoomReactionGroup[] = [],
  ): ITextRoomMessage {
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
      attachments: [...attachments],
      clientId: data.clientId ? uuidStringify(data.clientId) : null,
      reactions: [...reactions],
    };
  }

  private async loadAttachments(
    messages: readonly MessageEntity[],
  ): Promise<Map<string, IAttachment[]>> {
    return this.attachmentsService.findAttachedByMessageIds(
      messages.map((message) => message.id),
    );
  }

  private async loadReactions(
    messages: readonly MessageEntity[],
  ): Promise<Map<string, ITextRoomReactionGroup[]>> {
    if (messages.length === 0) {
      return new Map();
    }
    const messageIds = messages.map((message) => message.id);
    const rows = await this.messageReactionRepository.find({
      message: { $in: messageIds },
    });

    const map = new Map<string, Map<string, number[]>>();
    for (const row of rows) {
      const msgId = uuidStringify(row.message.id);
      let emojiMap = map.get(msgId);
      if (!emojiMap) {
        emojiMap = new Map();
        map.set(msgId, emojiMap);
      }
      let userIds = emojiMap.get(row.emoji);
      if (!userIds) {
        userIds = [];
        emojiMap.set(row.emoji, userIds);
      }
      userIds.push(row.user.id);
    }

    const result = new Map<string, ITextRoomReactionGroup[]>();
    for (const [msgId, emojiMap] of map.entries()) {
      const groups: ITextRoomReactionGroup[] = [];
      for (const [emoji, userIds] of emojiMap.entries()) {
        groups.push({
          emoji,
          count: userIds.length,
          userIds,
        });
      }
      result.set(msgId, groups);
    }
    return result;
  }

  private isEmptyContent(content: string): boolean {
    return htmlToPlainText(content).length === 0;
  }

  private messagePreview(
    content: string,
    attachments: readonly IAttachment[],
  ): string {
    const plain = htmlToPlainText(content);
    if (plain.length > 0) {
      return plain;
    }
    return `📎 ${attachments.map((item) => item.name).join(', ')}`;
  }

  private sameMessageTarget(
    message: MessageEntity,
    dto: CreateMessageDto,
  ): boolean {
    return (
      (message.room?.id ?? null) === (dto.roomId ?? null) &&
      (message.recipient?.id ?? null) === (dto.recipientId ?? null)
    );
  }

  private async existingMessageDto(
    user: GetUserDto,
    message: MessageEntity,
  ): Promise<ITextRoomMessage> {
    const [attachments, reactions, isReadMap] = await Promise.all([
      this.loadAttachments([message]),
      this.loadReactions([message]),
      this.buildIsReadMap([message], user.id),
    ]);
    const id = uuidStringify(message.id);
    return this.entityToDto(
      message,
      isReadMap.get(id) ?? false,
      attachments.get(id) ?? [],
      reactions.get(id) ?? [],
    );
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
    return this
      .messageRepository as unknown as SqlEntityRepository<MessageEntity>;
  }

  private createUnreadMessageIdsSubquery(userId: number) {
    // toRaw() is required: MessageEntity.id is Uint8Array, and FilterQuery
    // processWhere would otherwise convert the QueryBuilder via Uint8ArrayType.
    return (
      this
        .messageReadRepository as unknown as SqlEntityRepository<MessageReadEntity>
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
      const [isReadMap, attachments, reactions] = await Promise.all([
        this.buildIsReadMap(combined, user.id),
        this.loadAttachments(combined),
        this.loadReactions(combined),
      ]);
      return {
        items: combined.map((m) => {
          const id = uuidStringify(m.id);
          return this.entityToDto(
            m,
            isReadMap.get(id) ?? false,
            attachments.get(id) ?? [],
            reactions.get(id) ?? [],
          );
        }),
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

    const [isReadMap, attachments, reactions] = await Promise.all([
      this.buildIsReadMap(messages, user.id),
      this.loadAttachments(messages),
      this.loadReactions(messages),
    ]);
    return {
      items: messages.map((m) => {
        const id = uuidStringify(m.id);
        return this.entityToDto(
          m,
          isReadMap.get(id) ?? false,
          attachments.get(id) ?? [],
          reactions.get(id) ?? [],
        );
      }),
    };
  }

  async create(
    user: GetUserDto,
    dto: CreateMessageDto,
  ): Promise<ITextRoomMessage> {
    if (dto.clientId) {
      const existing = await this.messageRepository.findOne(
        { sender: user.id, clientId: parse(dto.clientId) },
        {
          populate: [
            'sender',
            'recipient',
            'room',
            'replyTo',
            'replyTo.sender',
          ],
        },
      );
      if (existing) {
        if (!this.sameMessageTarget(existing, dto)) {
          throw new ConflictException({ message: 'CLIENT_ID_CONFLICT' });
        }
        return this.existingMessageDto(user, existing);
      }
    }

    const requestedIds = dto.attachmentIds ?? [];
    if (this.isEmptyContent(dto.content) && requestedIds.length === 0) {
      throw new BadRequestException(SCHEMA_ERROR.MESSAGE_EMPTY);
    }
    if (requestedIds.length > 0) {
      const enabled = await this.settingsService.getValue(
        ESettingKey.ATTACHMENTS_ENABLED,
      );
      if (!enabled) {
        throw new ForbiddenException('ATTACHMENTS_DISABLED');
      }
      const maxFiles = await this.settingsService.getValue(
        ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE,
      );
      if (requestedIds.length > maxFiles) {
        throw new BadRequestException('ATTACHMENTS_TOO_MANY');
      }
    }
    const attachmentIds = [...new Set(requestedIds)];

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

    let message: MessageEntity;
    try {
      message = await this.em.transactional(async (tx) => {
        const created = tx.getRepository(MessageEntity).create(
          {
            sender: tx.getReference(UserEntity, user.id),
            recipient,
            room,
            replyToId,
            clientId: dto.clientId ? parse(dto.clientId) : null,
            contentEncrypted: encrypted,
            iv,
            authTag,
          },
          { persist: true },
        );
        if (replyTarget) {
          created.replyTo = replyTarget;
        }
        this.indexSearchTokens(tx, created, dto.content);
        await tx.flush();
        if (attachmentIds.length > 0) {
          await this.attachmentsService.claimForMessage(
            tx,
            user.id,
            created.id,
            attachmentIds,
          );
        }
        await tx.populate(created, ['sender', 'replyTo', 'replyTo.sender']);
        return created;
      });
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException && dto.clientId) {
        this.em.clear();
        const winner = await this.messageRepository.findOne(
          { sender: user.id, clientId: parse(dto.clientId) },
          {
            populate: [
              'sender',
              'recipient',
              'room',
              'replyTo',
              'replyTo.sender',
            ],
          },
        );
        if (winner) {
          if (!this.sameMessageTarget(winner, dto)) {
            throw new ConflictException({ message: 'CLIENT_ID_CONFLICT' });
          }
          return this.existingMessageDto(user, winner);
        }
      }
      throw error;
    }
    if (replyTarget) {
      message.replyTo = replyTarget;
    }
    const attachments = await this.loadAttachments([message]);
    const messageDto = this.entityToDto(
      message,
      false,
      attachments.get(uuidStringify(message.id)) ?? [],
    );
    emitTextRoomDomainEvent(
      this.eventEmitter,
      TextRoomDomainEvents.MESSAGE_CREATED,
      messageDto,
    );

    if (
      messageDto.recipientId &&
      messageDto.senderId !== messageDto.recipientId
    ) {
      emitNotificationsDomainEvent(
        this.eventEmitter,
        NotificationsDomainEvents.DIRECT_MESSAGE,
        {
          recipientId: messageDto.recipientId,
          senderId: messageDto.senderId,
          senderUsername: messageDto.senderUsername,
          messagePreview: this.messagePreview(
            messageDto.content,
            messageDto.attachments,
          ),
          messageId: messageDto.id,
        },
      );
    }

    return messageDto;
  }

  async updateMessage(
    user: GetUserDto,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<ITextRoomMessage> {
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

    const existingAttachments = await this.loadAttachments([message]);
    const currentAttachments =
      existingAttachments.get(uuidStringify(message.id)) ?? [];
    if (this.isEmptyContent(dto.content) && currentAttachments.length === 0) {
      throw new BadRequestException(SCHEMA_ERROR.MESSAGE_EMPTY);
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
    this.indexSearchTokens(this.em, message, dto.content);

    this.em.persist(message);
    await this.em.flush();

    const [isReadMap, updatedAttachments, reactions] = await Promise.all([
      this.buildIsReadMap([message], user.id),
      this.loadAttachments([message]),
      this.loadReactions([message]),
    ]);
    const id = uuidStringify(message.id);
    const messageDto = this.entityToDto(
      message,
      isReadMap.get(id) ?? false,
      updatedAttachments.get(id) ?? currentAttachments,
      reactions.get(id) ?? [],
    );
    emitTextRoomDomainEvent(
      this.eventEmitter,
      TextRoomDomainEvents.MESSAGE_UPDATED,
      messageDto,
    );
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

    const allowed = canDeleteTextRoomMessage(
      {
        senderId: message.sender.id,
        recipientId: message.recipient?.id ?? null,
        roomId: message.room?.id ?? null,
      },
      user,
    );
    if (!allowed) {
      throw new ForbiddenException('You can only delete your own messages');
    }

    this.em.remove(message);
    await this.em.flush();

    emitTextRoomDomainEvent(
      this.eventEmitter,
      TextRoomDomainEvents.MESSAGE_DELETED,
      { id: messageId },
    );
  }

  private indexSearchTokens(
    em: EntityManager,
    message: MessageEntity,
    content: string,
  ): void {
    const trigrams = extractTrigrams(content);
    trigrams.forEach((t) => {
      const tokenHash = this.encryptionService.hashSearchToken(t);
      const tokenEntity = em.create(MessageSearchTokenEntity, {
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

    const [attachments, reactions] = await Promise.all([
      this.loadAttachments(othersMessages),
      this.loadReactions(othersMessages),
    ]);
    for (const msg of othersMessages) {
      const id = uuidStringify(msg.id);
      emitTextRoomDomainEvent(
        this.eventEmitter,
        TextRoomDomainEvents.MESSAGE_UPDATED,
        this.entityToDto(
          msg,
          true,
          attachments.get(id) ?? [],
          reactions.get(id) ?? [],
        ),
      );
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

  async toggleReaction(
    user: GetUserDto,
    messageId: string,
    emoji: string,
  ): Promise<ITextRoomReactionGroup[]> {
    const message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender', 'recipient', 'room'] },
    );

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const isParticipant =
      message.sender.id === user.id ||
      message.recipient?.id === user.id ||
      message.room != null;

    if (!isParticipant) {
      throw new ForbiddenException('Access denied');
    }

    const existingReaction = await this.messageReactionRepository.findOne({
      message: message.id,
      user: user.id,
    });

    if (existingReaction) {
      if (existingReaction.emoji === emoji) {
        this.em.remove(existingReaction);
      } else {
        existingReaction.emoji = emoji;
      }
    } else {
      const newReaction = this.messageReactionRepository.create({
        message,
        user: this.em.getReference(UserEntity, user.id),
        emoji,
      });
      this.em.persist(newReaction);
    }

    await this.em.flush();

    const normalizedMessageId = uuidStringify(message.id);
    const reactionsMap = await this.loadReactions([message]);
    const updatedReactions = reactionsMap.get(normalizedMessageId) ?? [];

    emitTextRoomDomainEvent(
      this.eventEmitter,
      TextRoomDomainEvents.MESSAGE_REACTION_UPDATED,
      {
        messageId: normalizedMessageId,
        roomId: message.room?.id ?? null,
        recipientId: message.recipient?.id ?? null,
        senderId: message.sender.id,
        reactions: updatedReactions,
      },
    );

    return updatedReactions;
  }
}
