import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import {
  EPermission,
  type IMentionSet,
  MENTION_EVERYONE,
  type TMentionRecipient,
  diffMentionedUsers,
  getMentionTypesForUser,
  parseMentions,
  splitMentionSegments,
} from '@konvoez/shared';
import { htmlToMentionText } from '@shared/utils/html-text.util';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/users.entity';
import { PermissionsFacade } from '../permissions/permissions.facade';
import { RoomsFacade } from '../rooms/rooms.facade';
import { RoomEntity } from '../rooms/rooms.entity';
import { GetRoomDto } from '../rooms/rooms.dto';
import { GetUserSafeDto } from '../users/users.dto';
import { RoleEntity } from '../roles/roles.entity';
import { MessageEntity, MessageMentionEntity } from './text-rooms.entity';

@Injectable()
export class MentionsService {
  constructor(
    @Inject(UsersService)
    private readonly usersService: UsersService,
    @Inject(PermissionsFacade)
    private readonly permissionsFacade: PermissionsFacade,
    @Inject(RoomsFacade)
    private readonly roomsFacade: RoomsFacade,
    @InjectRepository(MessageMentionEntity)
    private readonly messageMentionRepository: EntityRepository<MessageMentionEntity>,
  ) {}

  async resolve(
    author: GetUserSafeDto,
    room: RoomEntity | GetRoomDto,
    html: string,
  ): Promise<{
    effective: IMentionSet;
    recipientIds: number[];
    recipients: TMentionRecipient[];
    usersById: Record<number, { username: string }>;
    rolesById: Record<number, { name: string }>;
  }> {
    const parsed = parseMentions(htmlToMentionText(html));
    const canMassMention =
      author.isOwner ||
      author.permissions.includes(EPermission.MENTION_EVERYONE);

    let effectiveRoles: RoleEntity[] = [];
    const rolesById: Record<number, { name: string }> = {};
    if (canMassMention && parsed.roleIds.length > 0) {
      const roles =
        (await this.permissionsFacade.findRolesByIds(parsed.roleIds)) ?? [];
      for (const r of roles) {
        rolesById[r.id] = { name: r.name };
      }
      effectiveRoles = roles.filter((r) => r.mentionable);
    }
    const effectiveRoleIds = effectiveRoles.map((r) => r.id);

    let candidateUsers: UserEntity[] = [];
    if (parsed.everyone && canMassMention) {
      candidateUsers = await this.usersService.findMentionCandidates({
        everyone: true,
        userIds: [],
        roleIds: [],
      });
    } else if (parsed.userIds.length > 0 || effectiveRoleIds.length > 0) {
      candidateUsers = await this.usersService.findMentionCandidates({
        everyone: false,
        userIds: parsed.userIds,
        roleIds: effectiveRoleIds,
      });
    }

    const recipientIdsSet = new Set<number>();
    const validUserIdsSet = new Set<number>();
    const recipients: TMentionRecipient[] = [];
    const usersById: Record<number, { username: string }> = {};

    for (const candidate of candidateUsers) {
      usersById[candidate.id] = { username: candidate.username };
      if (candidate.deletedAt !== null) {
        continue;
      }
      const dto = await this.usersService.toSafeDtoWithPermissions(candidate);
      if (dto.id !== author.id && this.roomsFacade.canAccessRoom(dto, room)) {
        recipientIdsSet.add(dto.id);
        if (parsed.userIds.includes(dto.id)) {
          validUserIdsSet.add(dto.id);
        }
        const types = getMentionTypesForUser(
          {
            userIds: parsed.userIds,
            roleIds: effectiveRoleIds,
            everyone: parsed.everyone && canMassMention,
          },
          dto,
        );
        recipients.push({ userId: dto.id, types });
      }
    }

    const effective: IMentionSet = {
      userIds: parsed.userIds.filter((id) => validUserIdsSet.has(id)),
      roleIds: effectiveRoleIds.sort((a, b) => a - b),
      everyone: parsed.everyone && canMassMention,
    };

    return {
      effective,
      recipientIds: Array.from(recipientIdsSet).sort((a, b) => a - b),
      recipients: recipients.sort((a, b) => a.userId - b.userId),
      usersById,
      rolesById,
    };
  }

  async replace(
    em: EntityManager,
    messageId: Uint8Array,
    recipientIds: number[],
  ): Promise<number[]> {
    const existing = await em.find(
      MessageMentionEntity,
      { message: messageId },
      { populate: ['user'] },
    );
    const existingUserIds = existing.map((row) => row.user.id);

    const toDelete = existing.filter(
      (row) => !recipientIds.includes(row.user.id),
    );
    for (const row of toDelete) {
      em.remove(row);
    }

    const addedIds = diffMentionedUsers(existingUserIds, recipientIds);
    for (const userId of addedIds) {
      const row = em.create(MessageMentionEntity, {
        message: em.getReference(MessageEntity, messageId),
        user: em.getReference(UserEntity, userId),
      });
      em.persist(row);
    }

    await em.flush();
    return addedIds;
  }

  renderPlainPreview(
    text: string,
    usersById: Record<number, { username: string }>,
    rolesById: Record<number, { name: string }>,
  ): string {
    const segments = splitMentionSegments(text);
    return segments
      .map((seg) => {
        if (seg.type === 'text') {
          return seg.value;
        }
        if (seg.type === 'everyone') {
          return MENTION_EVERYONE;
        }
        if (seg.type === 'user') {
          const user = usersById[seg.id];
          return user ? `@${user.username}` : '@unknown';
        }
        if (seg.type === 'role') {
          const role = rolesById[seg.id];
          return role ? `@${role.name}` : '@unknown';
        }
        return '';
      })
      .join('');
  }
}
