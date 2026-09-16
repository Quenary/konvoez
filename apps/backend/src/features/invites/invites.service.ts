import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import * as crypto from 'crypto';
import { inviteDefaultTtl, TInviteStatus } from '@konvoez/shared';
import { InviteEntity } from './invites.entity';
import { InviteCreateDto, InviteDto } from './invites.dto';
import { UserEntity } from '../users/users.entity';
import type { GetUserDto } from '../users/users.dto';

@Injectable()
export class InvitesService {
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(InviteEntity)
    private readonly repo: EntityRepository<InviteEntity>,
  ) {
    this.em = this.repo.getEntityManager();
  }

  calculateStatus(
    invite: Pick<InviteEntity, 'revokedAt' | 'usedAt' | 'expiresAt'>,
  ): TInviteStatus {
    if (invite.revokedAt) {
      return 'revoked';
    }
    if (invite.usedAt) {
      return 'used';
    }
    if (new Date() > new Date(invite.expiresAt)) {
      return 'expired';
    }
    return 'active';
  }

  toDto(invite: InviteEntity): InviteDto {
    return {
      id: invite.id,
      code: invite.code,
      email: invite.email ?? null,
      author: {
        id: invite.author.id,
        username: invite.author.username,
        fullname: invite.author.fullname,
      },
      expiresAt: invite.expiresAt,
      usedAt: invite.usedAt ?? null,
      usedBy: invite.usedBy
        ? {
            id: invite.usedBy.id,
            username: invite.usedBy.username,
            fullname: invite.usedBy.fullname,
          }
        : null,
      revokedAt: invite.revokedAt ?? null,
      status: this.calculateStatus(invite),
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt ?? null,
    } as InviteDto;
  }

  async create(
    dto: InviteCreateDto,
    authorUser: GetUserDto,
  ): Promise<InviteDto> {
    const code = crypto.randomBytes(16).toString('hex');
    const ttlMs = dto.ttl ?? inviteDefaultTtl;
    const expiresAt = new Date(Date.now() + ttlMs);
    const author = this.em.getReference(UserEntity, authorUser.id);

    const invite = this.repo.create({
      code,
      email: dto.email ? dto.email.trim().toLowerCase() : null,
      author,
      expiresAt,
    });

    this.em.persist(invite);
    await this.em.flush();
    return this.toDto(invite);
  }

  async findAll(): Promise<InviteDto[]> {
    const invites = await this.repo.find(
      {},
      {
        populate: ['author', 'usedBy'],
        orderBy: { createdAt: 'DESC' },
      },
    );
    return invites.map((invite) => this.toDto(invite));
  }

  async findOne(id: number): Promise<InviteEntity> {
    const invite = await this.repo.findOne(
      { id },
      { populate: ['author', 'usedBy'] },
    );
    if (!invite) {
      throw new NotFoundException(`Invite #${id} not found`);
    }
    return invite;
  }

  async revoke(id: number): Promise<InviteDto> {
    const invite = await this.findOne(id);
    if (invite.revokedAt) {
      return this.toDto(invite);
    }
    invite.revokedAt = new Date();
    await this.em.flush();
    return this.toDto(invite);
  }

  async delete(id: number): Promise<void> {
    const invite = await this.findOne(id);
    this.em.remove(invite);
    await this.em.flush();
  }

  async validate(code: string, email?: string): Promise<InviteEntity> {
    const invite = await this.repo.findOne({ code });
    if (!invite) {
      throw new ForbiddenException('Invalid invite code');
    }
    if (invite.revokedAt) {
      throw new ForbiddenException('Invite code has been revoked');
    }
    if (invite.usedAt) {
      throw new ForbiddenException('Invite code has already been used');
    }
    if (new Date() > new Date(invite.expiresAt)) {
      throw new ForbiddenException('Invite code has expired');
    }
    if (
      invite.email &&
      invite.email.toLowerCase() !== email?.trim().toLowerCase()
    ) {
      throw new ForbiddenException(
        'Invite code is bound to another email address',
      );
    }
    return invite;
  }

  async consume(invite: InviteEntity, user: UserEntity): Promise<InviteEntity> {
    invite.usedAt = new Date();
    invite.usedBy = user;
    this.em.persist(invite);
    await this.em.flush();
    return invite;
  }
}
