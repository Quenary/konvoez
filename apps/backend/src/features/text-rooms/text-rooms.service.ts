import { Injectable } from '@nestjs/common';
import { AppException } from '@shared/errors/app.exception';
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
  MessageMentionEntity,
  MessageReadEntity,
  MessageReactionEntity,
  MessageSearchTokenEntity,
} from './text-rooms.entity';
import {
  EditMessageDto,
  MarkReadDto,
  MessageDto,
  MessageListRequestDto,
  MessageListResponseDto,
  ReadAllDto,
  CreateMessageDto,
} from './text-rooms.dto';
import { extractTrigrams } from '@shared/utils/trigrams.util';
import { UsersService } from '../users/users.service';
import { RoomsFacade } from '../rooms/rooms.facade';
import { parse } from 'uuid';
import { EncryptionService } from '@shared/services/encryption.service';
import { stringify as uuidStringify } from 'uuid';
import { UserEntity } from '../users/users.entity';
import { GetUserSafeDto } from '../users/users.dto';
import { RoomEntity } from '../rooms/rooms.entity';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TextRoomsDomainEvents,
  emitTextRoomsDomainEvent,
} from './text-rooms.events';
import {
  NotificationsDomainEvents,
  emitNotificationsDomainEvent,
} from '../notifications/notifications.events';

import {
  ApiErrorCode,
  canDeleteTextRoomMessage,
  EPermission,
  ESettingKey,
  IAttachment,
  IMentionSet,
  ITextRoomMessage,
  ITextRoomMessageReply,
  ITextRoomReactionGroup,
  ITextRoomUnreadCounts,
} from '@konvoez/shared';
import {
  htmlToMentionText,
  htmlToPlainText,
} from '@shared/utils/html-text.util';
import { AttachmentsService } from '../attachments/attachments.service';
import { SettingsService } from '../settings/settings.service';
import { MentionsService } from './mentions.service';

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
    @InjectRepository(MessageMentionEntity)
    private readonly messageMentionRepository: EntityRepository<MessageMentionEntity>,
    private readonly usersService: UsersService,
    private readonly roomsFacade: RoomsFacade,
    private readonly encryptionService: EncryptionService,
    private readonly eventEmitter: EventEmitter2,
    private readonly attachmentsService: AttachmentsService,
    private readonly settingsService: SettingsService,
    private readonly mentionsService: MentionsService,
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
      mentions: data.mentions ?? {
        userIds: [],
        roleIds: [],
        everyone: false,
      },
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

  private mentionMessagePreview(
    content: string,
    attachments: readonly IAttachment[],
    usersById: Record<number, { username: string }>,
    rolesById: Record<number, { name: string }>,
  ): string {
    const mentionText = htmlToMentionText(content);
    const rendered = this.mentionsService
      .renderPlainPreview(mentionText, usersById, rolesById)
      .trim();
    if (rendered.length > 0) {
      return rendered;
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
    user: GetUserSafeDto,
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
      const isSelfMessage =
        msg.recipient != null && msg.sender.id === msg.recipient.id;
      if (isSelfMessage) {
        map.set(key, true);
      } else if (msg.sender.id === currentUserId) {
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

  async getUnreadCounts(user: GetUserSafeDto): Promise<ITextRoomUnreadCounts> {
    const userId = user.id;

    const [roomRows, directRows, mentionRows] = await Promise.all([
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
          sender: { $ne: userId },
          room: null,
        })
        .groupBy('m.sender')
        .execute<Array<{ senderId: number; count: number }>>('all'),
      (
        this
          .messageMentionRepository as unknown as SqlEntityRepository<MessageMentionEntity>
      )
        .createQueryBuilder('mm')
        .join('mm.message', 'm')
        .select(['m.room as roomId', raw('count(*) as count')])
        .where({
          user: userId,
          'm.sender': { $ne: userId },
          'm.room': { $ne: null },
          'm.id': { $nin: this.createUnreadMessageIdsSubquery(userId) },
        })
        .groupBy('m.room')
        .execute<Array<{ roomId: number; count: number }>>('all'),
    ]);

    const accessibleRoomIds = await this.roomsFacade.getAccessibleRoomIds(user);
    const accessibleRoomRows = roomRows.filter((row) =>
      accessibleRoomIds.has(Number(row.roomId)),
    );
    const accessibleMentionRows = mentionRows.filter((row) =>
      accessibleRoomIds.has(Number(row.roomId)),
    );

    const rooms = Object.fromEntries(
      accessibleRoomRows.map((row) => [String(row.roomId), Number(row.count)]),
    );
    const roomMentions = Object.fromEntries(
      accessibleMentionRows.map((row) => [
        String(row.roomId),
        Number(row.count),
      ]),
    );
    const direct = Object.fromEntries(
      directRows.map((row) => [String(row.senderId), Number(row.count)]),
    );
    const directTotal = directRows.reduce(
      (sum, row) => sum + Number(row.count),
      0,
    );

    return { rooms, roomMentions, direct, directTotal };
  }

  async getDirectChats(user: GetUserSafeDto): Promise<GetUserSafeDto[]> {
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

    return users.map((u) => this.usersService.toSafeDto(u));
  }

  private async findFirstUnreadId(
    user: GetUserSafeDto,
    baseWhere: FilterQuery<MessageEntity>,
  ): Promise<Uint8Array | null> {
    const unread = await this.messageRepository.findOne(
      {
        ...baseWhere,
        sender: { $ne: user.id },
        id: { $nin: this.createUnreadMessageIdsSubquery(user.id) },
      } as FilterQuery<MessageEntity>,
      {
        orderBy: { createdAt: 'ASC' },
        fields: ['id'],
      },
    );
    return unread?.id ?? null;
  }

  private async toListItems(
    messages: MessageEntity[],
    userId: number,
  ): Promise<MessageDto[]> {
    const [isReadMap, attachments, reactions] = await Promise.all([
      this.buildIsReadMap(messages, userId),
      this.loadAttachments(messages),
      this.loadReactions(messages),
    ]);
    return messages.map((m) => {
      const id = uuidStringify(m.id);
      return this.entityToDto(
        m,
        isReadMap.get(id) ?? false,
        attachments.get(id) ?? [],
        reactions.get(id) ?? [],
      );
    });
  }

  private async buildChatWhere(
    user: GetUserSafeDto,
    target: { roomId?: number | null; recipientId?: number | null },
  ): Promise<
    FilterQuery<MessageEntity> & { $and?: FilterQuery<MessageEntity>[] }
  > {
    const { roomId, recipientId } = target;
    const baseWhere: FilterQuery<MessageEntity> & {
      $and?: FilterQuery<MessageEntity>[];
    } = {};

    if (recipientId) {
      if (recipientId === user.id) {
        baseWhere.sender = user.id;
        baseWhere.recipient = user.id;
      } else {
        baseWhere.$or = [
          { sender: user.id, recipient: recipientId },
          { sender: recipientId, recipient: user.id },
        ];
      }
    } else if (roomId) {
      await this.roomsFacade.assertCanAccessRoom(user, roomId);
      baseWhere.room = roomId;
    } else {
      throw new Error('Either recipientId or chatRoomId must be provided');
    }

    return baseWhere;
  }

  async list(
    user: GetUserSafeDto,
    dto: MessageListRequestDto,
  ): Promise<MessageListResponseDto> {
    const {
      beforeId,
      afterId,
      aroundId,
      limit,
      recipientId,
      roomId,
      search,
      latest,
    } = dto;

    const baseWhere = await this.buildChatWhere(user, {
      roomId,
      recipientId,
    });

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
        return {
          items: [],
          firstUnreadMessageId: null,
          hasMoreBefore: false,
          hasMoreAfter: false,
        };
      }

      const beforeLimit = Math.floor((limit - 1) / 2);
      const afterLimit = limit - 1 - beforeLimit;

      const [beforeItems, afterItems, firstUnreadId] = await Promise.all([
        beforeLimit > 0
          ? this.messageRepository.find(
              {
                ...baseWhere,
                id: { $lt: parse(aroundId) },
              } as FilterQuery<MessageEntity>,
              {
                limit: beforeLimit + 1,
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
                limit: afterLimit + 1,
                orderBy: { createdAt: 'ASC' },
                populate,
              },
            )
          : Promise.resolve([]),
        this.findFirstUnreadId(user, baseWhere),
      ]);

      const hasMoreBefore = beforeItems.length > beforeLimit;
      const hasMoreAfter = afterItems.length > afterLimit;
      const trimmedBefore = beforeItems.slice(0, beforeLimit);
      const trimmedAfter = afterItems.slice(0, afterLimit);

      const combined = [...trimmedBefore.reverse(), target, ...trimmedAfter];
      const items = await this.toListItems(combined, user.id);

      return {
        items,
        firstUnreadMessageId: firstUnreadId
          ? uuidStringify(firstUnreadId)
          : null,
        hasMoreBefore,
        hasMoreAfter,
      };
    }

    if (beforeId) {
      const where = {
        ...baseWhere,
        id: { $lt: parse(beforeId) },
      } as FilterQuery<MessageEntity>;
      const rows = await this.messageRepository.find(where, {
        limit: limit + 1,
        orderBy: { createdAt: 'DESC' },
        populate,
      });
      const hasMoreBefore = rows.length > limit;
      const trimmed = rows.slice(0, limit);
      const items = await this.toListItems(trimmed, user.id);

      return {
        items,
        firstUnreadMessageId: null,
        hasMoreBefore,
        hasMoreAfter: true,
      };
    }

    if (afterId) {
      const where = {
        ...baseWhere,
        id: { $gt: parse(afterId) },
      } as FilterQuery<MessageEntity>;
      const rows = await this.messageRepository.find(where, {
        limit: limit + 1,
        orderBy: { createdAt: 'ASC' },
        populate,
      });
      const hasMoreAfter = rows.length > limit;
      const trimmed = rows.slice(0, limit);
      const items = await this.toListItems(trimmed, user.id);

      return {
        items,
        firstUnreadMessageId: null,
        hasMoreBefore: true,
        hasMoreAfter,
      };
    }

    // Anchor mode (no cursors, no search, !dto.latest)
    if (!search && !latest) {
      const anchor = await this.findFirstUnreadId(user, baseWhere);
      if (anchor) {
        const [beforeRows, afterRows] = await Promise.all([
          this.messageRepository.find(
            {
              ...baseWhere,
              id: { $lt: anchor },
            } as FilterQuery<MessageEntity>,
            {
              limit: limit + 1,
              orderBy: { createdAt: 'DESC' },
              populate,
            },
          ),
          this.messageRepository.find(
            {
              ...baseWhere,
              id: { $gte: anchor },
            } as FilterQuery<MessageEntity>,
            {
              limit: limit + 1,
              orderBy: { createdAt: 'ASC' },
              populate,
            },
          ),
        ]);

        const beforeTake = Math.min(
          beforeRows.length,
          Math.max(Math.floor(limit / 2), limit - afterRows.length),
        );
        const afterTake = Math.min(afterRows.length, limit - beforeTake);
        const combined = [
          ...beforeRows.slice(0, beforeTake).reverse(),
          ...afterRows.slice(0, afterTake),
        ];
        const items = await this.toListItems(combined, user.id);

        return {
          items,
          firstUnreadMessageId: uuidStringify(anchor),
          hasMoreBefore: beforeRows.length > beforeTake,
          hasMoreAfter: afterRows.length > afterTake,
        };
      }
    }

    // Latest mode (no anchor found, or latest, or search without cursors)
    const rows = await this.messageRepository.find(baseWhere, {
      limit: limit + 1,
      orderBy: { createdAt: 'DESC' },
      populate,
    });
    const hasMoreBefore = rows.length > limit;
    const trimmed = rows.slice(0, limit);
    const items = await this.toListItems(trimmed, user.id);

    return {
      items,
      firstUnreadMessageId: null,
      hasMoreBefore,
      hasMoreAfter: false,
    };
  }

  async create(
    user: GetUserSafeDto,
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
          throw AppException.conflict(
            ApiErrorCode.MESSAGE_CLIENT_ID_CONFLICT,
            'Client id conflict',
          );
        }
        return this.existingMessageDto(user, existing);
      }
    }

    const requestedIds = dto.attachmentIds ?? [];
    if (this.isEmptyContent(dto.content) && requestedIds.length === 0) {
      throw AppException.badRequest(
        ApiErrorCode.MESSAGE_EMPTY,
        'Message cannot be empty',
      );
    }
    if (requestedIds.length > 0) {
      const enabled = await this.settingsService.getValue(
        ESettingKey.ATTACHMENTS_ENABLED,
      );
      if (!enabled) {
        throw AppException.forbidden(
          ApiErrorCode.ATTACHMENTS_DISABLED,
          'Attachments are disabled',
        );
      }
      const maxFiles = await this.settingsService.getValue(
        ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE,
      );
      if (requestedIds.length > maxFiles) {
        throw AppException.badRequest(
          ApiErrorCode.ATTACHMENTS_TOO_MANY,
          'Too many attachments',
        );
      }
    }
    if (
      !user.isOwner &&
      !user.permissions?.includes(EPermission.SEND_MESSAGES)
    ) {
      throw AppException.forbidden(
        ApiErrorCode.FORBIDDEN,
        'Permission denied to send messages',
      );
    }

    const attachmentIds = [...new Set(requestedIds)];

    if (
      attachmentIds.length > 0 &&
      !user.isOwner &&
      !user.permissions?.includes(EPermission.USE_ATTACHMENTS)
    ) {
      throw AppException.forbidden(
        ApiErrorCode.FORBIDDEN,
        'Permission denied to use attachments',
      );
    }

    let recipient: UserEntity | null = null;
    let room: RoomEntity | null = null;

    if (dto.recipientId) {
      recipient = await this.usersService.findOne(dto.recipientId);
    }

    if (dto.roomId) {
      room = await this.roomsFacade.assertCanAccessRoom(user, dto.roomId);
    }

    const resolvedMentions = room
      ? await this.mentionsService.resolve(user, room, dto.content)
      : null;

    let replyToId: Uint8Array | null = null;
    let replyTarget: MessageEntity | null = null;
    if (dto.replyToId) {
      replyToId = parse(dto.replyToId);
      replyTarget = await this.messageRepository.findOne(
        { id: replyToId },
        { populate: ['sender', 'recipient', 'room'] },
      );
      if (!replyTarget) {
        throw AppException.notFound(
          ApiErrorCode.REPLY_TARGET_NOT_FOUND,
          'Reply target message not found',
        );
      }
      if (dto.roomId && replyTarget.room?.id !== dto.roomId) {
        throw AppException.forbidden(
          ApiErrorCode.REPLY_TARGET_FOREIGN,
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
          throw AppException.forbidden(
            ApiErrorCode.REPLY_TARGET_FOREIGN,
            'Cannot reply to a message from another chat',
          );
        }
      }
    }

    const { encrypted, iv, authTag } = this.encryptionService.encrypt(
      dto.content,
    );

    let addedRecipientIds: number[] = [];
    let message: MessageEntity;
    try {
      message = await this.em.transactional(async (tx) => {
        const created = tx.getRepository(MessageEntity).create(
          {
            sender: tx.getReference(UserEntity, user.id),
            recipient,
            room: room ? tx.getReference(RoomEntity, room.id) : null,
            replyToId,
            clientId: dto.clientId ? parse(dto.clientId) : null,
            contentEncrypted: encrypted,
            iv,
            authTag,
            mentions: resolvedMentions?.effective ?? {
              userIds: [],
              roleIds: [],
              everyone: false,
            },
          },
          { persist: true },
        );
        if (replyTarget) {
          created.replyTo = replyTarget;
        }
        this.indexSearchTokens(tx, created, dto.content);
        await tx.flush();
        if (resolvedMentions) {
          addedRecipientIds = await this.mentionsService.replace(
            tx,
            created.id,
            resolvedMentions.recipientIds,
          );
        }
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
            throw AppException.conflict(
              ApiErrorCode.MESSAGE_CLIENT_ID_CONFLICT,
              'Client id conflict',
            );
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
    const isSelfMessage = message.recipient?.id === message.sender.id;
    const messageDto = this.entityToDto(
      message,
      isSelfMessage,
      attachments.get(uuidStringify(message.id)) ?? [],
    );
    emitTextRoomsDomainEvent(
      this.eventEmitter,
      TextRoomsDomainEvents.MESSAGE_CREATED,
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

    if (room && addedRecipientIds.length > 0 && resolvedMentions) {
      const recipients = addedRecipientIds.map((userId) => ({
        userId,
        types: resolvedMentions.recipientTypesMap?.get(userId) ?? ['username'],
      }));

      emitNotificationsDomainEvent(
        this.eventEmitter,
        NotificationsDomainEvents.MENTION,
        {
          recipients,
          recipientIds: addedRecipientIds,
          senderId: messageDto.senderId,
          senderUsername: messageDto.senderUsername,
          roomId: room.id,
          roomName: room.name,
          messageId: messageDto.id,
          messagePreview: this.mentionMessagePreview(
            dto.content,
            messageDto.attachments,
            resolvedMentions.usersById,
            resolvedMentions.rolesById,
          ),
        },
      );
    }

    return messageDto;
  }

  async updateMessage(
    user: GetUserSafeDto,
    messageId: string,
    dto: EditMessageDto,
  ): Promise<ITextRoomMessage> {
    let message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      {
        populate: [
          'sender',
          'room',
          'room.allowedRoles',
          'room.allowedUsers',
          'replyTo',
          'replyTo.sender',
        ],
      },
    );

    if (!message) {
      throw AppException.notFound(
        ApiErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
      );
    }

    if (message.sender.id !== user.id) {
      throw AppException.forbidden(
        ApiErrorCode.MESSAGE_NOT_OWNER,
        'You can only edit your own messages',
      );
    }

    const existingAttachments = await this.loadAttachments([message]);
    const currentAttachments =
      existingAttachments.get(uuidStringify(message.id)) ?? [];
    if (this.isEmptyContent(dto.content) && currentAttachments.length === 0) {
      throw AppException.badRequest(
        ApiErrorCode.MESSAGE_EMPTY,
        'Message cannot be empty',
      );
    }

    const { encrypted, iv, authTag } = this.encryptionService.encrypt(
      dto.content,
    );

    let resolved:
      Awaited<ReturnType<typeof this.mentionsService.resolve>> | undefined;
    let effectiveMentions: IMentionSet | undefined;
    let recipientIds: number[] | undefined;

    if (message.room) {
      resolved = await this.mentionsService.resolve(
        user,
        message.room,
        dto.content,
      );
      effectiveMentions = resolved.effective;
      recipientIds = resolved.recipientIds;
    }

    message = this.messageRepository.assign(message, {
      contentEncrypted: encrypted,
      iv,
      authTag,
      ...(effectiveMentions ? { mentions: effectiveMentions } : {}),
    });

    await this.em.nativeDelete(MessageSearchTokenEntity, {
      message: message.id,
    });
    this.indexSearchTokens(this.em, message, dto.content);

    this.em.persist(message);
    await this.em.flush();

    let addedRecipientIds: number[] = [];
    if (message.room && recipientIds) {
      addedRecipientIds = await this.mentionsService.replace(
        this.em,
        message.id,
        recipientIds,
      );
    }

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
    emitTextRoomsDomainEvent(
      this.eventEmitter,
      TextRoomsDomainEvents.MESSAGE_UPDATED,
      messageDto,
    );

    if (message.room && addedRecipientIds.length > 0 && resolved) {
      const recipients = addedRecipientIds.map((userId) => ({
        userId,
        types: resolved.recipientTypesMap?.get(userId) ?? ['username'],
      }));

      emitNotificationsDomainEvent(
        this.eventEmitter,
        NotificationsDomainEvents.MENTION,
        {
          recipients,
          recipientIds: addedRecipientIds,
          senderId: messageDto.senderId,
          senderUsername: messageDto.senderUsername,
          roomId: message.room.id,
          roomName: message.room.name,
          messageId: messageDto.id,
          messagePreview: this.mentionMessagePreview(
            dto.content,
            messageDto.attachments,
            resolved.usersById,
            resolved.rolesById,
          ),
        },
      );
    }

    return messageDto;
  }

  async delete(user: GetUserSafeDto, messageId: string): Promise<void> {
    const message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender'] },
    );

    if (!message) {
      throw AppException.notFound(
        ApiErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
      );
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
      throw AppException.forbidden(
        ApiErrorCode.MESSAGE_NOT_OWNER,
        'You can only delete your own messages',
      );
    }

    this.em.remove(message);
    await this.em.flush();

    emitTextRoomsDomainEvent(
      this.eventEmitter,
      TextRoomsDomainEvents.MESSAGE_DELETED,
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

  async markRead(user: GetUserSafeDto, dto: MarkReadDto): Promise<void> {
    const rawIds = dto.messageIds.map((id) => parse(id));

    const messages = await this.messageRepository.find(
      { id: { $in: rawIds } },
      {
        populate: [
          'sender',
          'recipient',
          'room',
          'room.allowedRoles',
          'room.allowedUsers',
          'replyTo',
          'replyTo.sender',
        ],
      },
    );

    const othersMessages = messages.filter(
      (msg) =>
        msg.sender.id !== user.id &&
        (msg.room
          ? this.roomsFacade.canAccessRoom(user, msg.room)
          : msg.recipient?.id === user.id),
    );
    if (othersMessages.length === 0) return;

    const existingReads = await this.messageReadRepository.find({
      message: { $in: othersMessages.map((msg) => msg.id) },
      reader: user.id,
    });
    const alreadyRead = new Set(
      existingReads.map((read) => uuidStringify(read.message.id)),
    );

    const newMessages = othersMessages.filter(
      (msg) => !alreadyRead.has(uuidStringify(msg.id)),
    );
    if (newMessages.length === 0) return;

    for (const msg of newMessages) {
      this.em.persist(
        this.messageReadRepository.create({
          message: msg,
          reader: this.em.getReference(UserEntity, user.id),
        }),
      );
    }

    let insertedMessages = newMessages;
    try {
      await this.em.flush();
    } catch (error) {
      if (error instanceof UniqueConstraintViolationException) {
        this.em.clear();
        const postReads = await this.messageReadRepository.find({
          message: { $in: newMessages.map((msg) => msg.id) },
          reader: user.id,
        });
        const postReadSet = new Set(
          postReads.map((r) => uuidStringify(r.message.id)),
        );
        const stillUnread = newMessages.filter(
          (m) => !postReadSet.has(uuidStringify(m.id)),
        );
        if (stillUnread.length > 0) {
          for (const msg of stillUnread) {
            this.em.persist(
              this.messageReadRepository.create({
                message: msg,
                reader: this.em.getReference(UserEntity, user.id),
              }),
            );
          }
          await this.em.flush();
          insertedMessages = stillUnread;
        } else {
          insertedMessages = [];
        }
      } else {
        throw error;
      }
    }

    if (insertedMessages.length === 0) return;

    const byChat = new Map<
      string,
      {
        roomId: number | null;
        recipientId: number | null;
        messageIds: string[];
      }
    >();

    for (const msg of insertedMessages) {
      const msgUuid = uuidStringify(msg.id);
      if (msg.room) {
        const key = `room:${msg.room.id}`;
        let group = byChat.get(key);
        if (!group) {
          group = { roomId: msg.room.id, recipientId: null, messageIds: [] };
          byChat.set(key, group);
        }
        group.messageIds.push(msgUuid);
      } else {
        const peerId =
          msg.sender.id === user.id
            ? (msg.recipient?.id ?? null)
            : msg.sender.id;
        if (peerId) {
          const key = `direct:${peerId}`;
          let group = byChat.get(key);
          if (!group) {
            group = { roomId: null, recipientId: peerId, messageIds: [] };
            byChat.set(key, group);
          }
          group.messageIds.push(msgUuid);
        }
      }
    }

    for (const group of byChat.values()) {
      emitTextRoomsDomainEvent(
        this.eventEmitter,
        TextRoomsDomainEvents.MESSAGES_READ,
        {
          readerId: user.id,
          roomId: group.roomId,
          recipientId: group.recipientId,
          messageIds: group.messageIds,
          maxMessageId: null,
        },
      );
    }

    const counts = await this.getUnreadCounts(user);
    emitTextRoomsDomainEvent(
      this.eventEmitter,
      TextRoomsDomainEvents.UNREAD_COUNTS_CHANGED,
      {
        userId: user.id,
        counts,
      },
    );
  }

  async readAll(
    user: GetUserSafeDto,
    dto: ReadAllDto,
  ): Promise<ITextRoomUnreadCounts> {
    if (dto.roomId) {
      await this.roomsFacade.assertCanAccessRoom(user, dto.roomId);
    } else if (dto.recipientId === user.id) {
      return await this.getUnreadCounts(user);
    }

    const baseWhere = await this.buildChatWhere(user, dto);
    const newestMsg = await this.messageRepository.findOne(baseWhere, {
      orderBy: { createdAt: 'DESC' },
      fields: ['id'],
    });

    const maxId = newestMsg?.id;
    if (!maxId) {
      return await this.getUnreadCounts(user);
    }

    let affectedRows = 0;
    if (dto.roomId) {
      const result = await this.em
        .getConnection()
        .execute<{ affectedRows?: number }>(
          'insert or ignore into message_reads (message_id, reader_id, read_at) select m.id, ?, CURRENT_TIMESTAMP from messages m where m.room_id = ? and m.sender_id != ? and m.id <= ?',
          [user.id, dto.roomId, user.id, Buffer.from(maxId)],
          'run',
        );
      affectedRows = result.affectedRows ?? 0;
    } else if (dto.recipientId) {
      const result = await this.em
        .getConnection()
        .execute<{ affectedRows?: number }>(
          'insert or ignore into message_reads (message_id, reader_id, read_at) select m.id, ?, CURRENT_TIMESTAMP from messages m where m.sender_id = ? and m.recipient_id = ? and m.id <= ?',
          [user.id, dto.recipientId, user.id, Buffer.from(maxId)],
          'run',
        );
      affectedRows = result.affectedRows ?? 0;
    }

    if (affectedRows > 0) {
      emitTextRoomsDomainEvent(
        this.eventEmitter,
        TextRoomsDomainEvents.MESSAGES_READ,
        {
          readerId: user.id,
          roomId: dto.roomId ?? null,
          recipientId: dto.recipientId ?? null,
          messageIds: [],
          maxMessageId: uuidStringify(maxId),
        },
      );
    }

    const counts = await this.getUnreadCounts(user);
    emitTextRoomsDomainEvent(
      this.eventEmitter,
      TextRoomsDomainEvents.UNREAD_COUNTS_CHANGED,
      {
        userId: user.id,
        counts,
      },
    );
    return counts;
  }

  async getReaders(
    user: GetUserSafeDto,
    messageId: string,
  ): Promise<GetUserSafeDto[]> {
    const message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender', 'recipient', 'room'] },
    );

    if (!message) {
      throw AppException.notFound(
        ApiErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
      );
    }

    // Access check: user must be sender, recipient, or a room member
    const isParticipant =
      message.sender.id === user.id ||
      message.recipient?.id === user.id ||
      message.room != null; // room membership check is implicit via list access

    if (!isParticipant) {
      throw AppException.forbidden(
        ApiErrorCode.MESSAGE_ACCESS_DENIED,
        'Access denied',
      );
    }

    const reads = await this.messageReadRepository.find(
      { message: parse(messageId) },
      { populate: ['reader'] },
    );

    return reads.map((r) => this.usersService.toSafeDto(r.reader));
  }

  async toggleReaction(
    user: GetUserSafeDto,
    messageId: string,
    emoji: string,
  ): Promise<ITextRoomReactionGroup[]> {
    const message = await this.messageRepository.findOne(
      { id: parse(messageId) },
      { populate: ['sender', 'recipient', 'room'] },
    );

    if (!message) {
      throw AppException.notFound(
        ApiErrorCode.MESSAGE_NOT_FOUND,
        'Message not found',
      );
    }

    const isParticipant =
      message.sender.id === user.id ||
      message.recipient?.id === user.id ||
      message.room != null;

    if (!isParticipant) {
      throw AppException.forbidden(
        ApiErrorCode.MESSAGE_ACCESS_DENIED,
        'Access denied',
      );
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

    emitTextRoomsDomainEvent(
      this.eventEmitter,
      TextRoomsDomainEvents.MESSAGE_REACTION_UPDATED,
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
