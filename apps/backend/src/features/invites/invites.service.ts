import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import * as crypto from 'crypto';
import {
  ApiErrorCode,
  ESettingKey,
  inviteDefaultTtl,
  buildInviteUrl,
  inviteResendEmailCooldownMs,
  TInviteStatus,
} from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { MailService } from '@shared/services/mail.service';
import { SettingsService } from '../settings/settings.service';
import { InviteEntity } from './invites.entity';
import { InviteCreateDto, InviteDto } from './invites.dto';
import { UserEntity } from '../users/users.entity';
import type { GetUserSafeDto } from '../users/users.dto';

@Injectable()
export class InvitesService {
  private readonly logger = new Logger(InvitesService.name);
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(InviteEntity)
    private readonly repo: EntityRepository<InviteEntity>,
    private readonly mailService: MailService,
    private readonly settingsService: SettingsService,
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

  toDto(
    invite: InviteEntity,
    options?: { url?: string; emailSendFailed?: boolean },
  ): InviteDto {
    const status = this.calculateStatus(invite);
    const isActive = status === 'active';
    return {
      id: invite.id,
      ...(isActive ? { code: invite.code } : {}),
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
      status,
      emailSent: Boolean(invite.emailSent),
      emailSentAt: invite.emailSentAt ?? null,
      createdAt: invite.createdAt,
      updatedAt: invite.updatedAt ?? null,
      ...(isActive && options?.url ? { url: options.url } : {}),
      ...(options?.emailSendFailed ? { emailSendFailed: true } : {}),
    } as InviteDto;
  }

  async create(
    dto: InviteCreateDto,
    authorUser: GetUserSafeDto,
  ): Promise<InviteDto> {
    const code = crypto.randomBytes(16).toString('hex');
    const ttlMs = dto.ttl ?? inviteDefaultTtl;
    const expiresAt = new Date(Date.now() + ttlMs);
    const email = dto.email ? dto.email.trim().toLowerCase() : null;
    const baseUrl = await this.getBaseUrl();
    const inviteUrl = baseUrl
      ? (buildInviteUrl(baseUrl, code, email) ?? undefined)
      : undefined;
    const shouldSendEmail = Boolean(dto.sendEmail && email);

    if (shouldSendEmail) {
      this.assertCanSendEmail(inviteUrl);
    }

    const invite = await this.em.transactional(async (tx) => {
      if (email) {
        const existingActive = await tx.findOne(InviteEntity, {
          email,
          revokedAt: null,
          usedAt: null,
          expiresAt: { $gt: new Date() },
        });
        if (existingActive) {
          throw AppException.conflict(
            ApiErrorCode.INVITE_EMAIL_EXISTS,
            'An active invite for this email already exists',
          );
        }
      }
      const created = tx.create(InviteEntity, {
        code,
        email,
        author: tx.getReference(UserEntity, authorUser.id),
        expiresAt,
        emailSent: false,
        emailSentAt: null,
      });
      tx.persist(created);
      return created;
    });

    let emailSendFailed = false;
    if (shouldSendEmail && inviteUrl) {
      try {
        await this.sendInviteEmail(invite, authorUser, inviteUrl);
        const sentAt = new Date();
        await this.em.nativeUpdate(
          InviteEntity,
          { id: invite.id },
          { emailSent: true, emailSentAt: sentAt },
        );
        invite.emailSent = true;
        invite.emailSentAt = sentAt;
      } catch (error) {
        this.logger.warn(`Failed to send invite email to ${email}`, error);
        emailSendFailed = true;
      }
    }

    return this.toDto(invite, { url: inviteUrl, emailSendFailed });
  }

  async findAll(): Promise<InviteDto[]> {
    const invites = await this.repo.find(
      {},
      {
        populate: ['author', 'usedBy'],
        orderBy: { createdAt: 'DESC' },
      },
    );
    const baseUrl = await this.getBaseUrl();
    return invites.map((invite) => {
      const isActive = this.calculateStatus(invite) === 'active';
      return this.toDto(invite, {
        url:
          isActive && baseUrl
            ? (buildInviteUrl(baseUrl, invite.code, invite.email) ?? undefined)
            : undefined,
      });
    });
  }

  async findOne(id: number): Promise<InviteEntity> {
    const invite = await this.repo.findOne(
      { id },
      { populate: ['author', 'usedBy'] },
    );
    if (!invite) {
      throw AppException.notFound(ApiErrorCode.INVITE_NOT_FOUND, {
        message: `Invite #${id} not found`,
        params: { id },
      });
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
      throw AppException.forbidden(
        ApiErrorCode.INVITE_INVALID,
        'Invalid invite code',
      );
    }
    this.assertUsable(invite);
    if (
      invite.email &&
      invite.email.toLowerCase() !== email?.trim().toLowerCase()
    ) {
      throw AppException.forbidden(
        ApiErrorCode.INVITE_EMAIL_MISMATCH,
        'Invite code is bound to another email address',
      );
    }
    return invite;
  }

  async consume(invite: InviteEntity, user: UserEntity): Promise<InviteEntity> {
    const claimed = await this.em.nativeUpdate(
      InviteEntity,
      invite.id
        ? {
            id: invite.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          }
        : {
            code: invite.code,
            usedAt: null,
            revokedAt: null,
            expiresAt: { $gt: new Date() },
          },
      {
        usedAt: new Date(),
        usedBy: user.id,
      },
    );
    if (!claimed) {
      throw AppException.forbidden(
        ApiErrorCode.INVITE_USED,
        'Invite code has already been used or expired',
      );
    }
    invite.usedAt = new Date();
    invite.usedBy = user;
    this.em.persist(invite);
    await this.em.flush();
    return invite;
  }

  async resend(id: number, currentUser: GetUserSafeDto): Promise<InviteDto> {
    const invite = await this.findOne(id);
    this.assertUsable(invite);
    if (!invite.email) {
      throw AppException.badRequest(
        ApiErrorCode.INVITE_INVALID,
        'Invite is not bound to an email address',
      );
    }
    const baseUrl = await this.getBaseUrl();
    const inviteUrl = baseUrl
      ? buildInviteUrl(baseUrl, invite.code, invite.email)
      : null;
    this.assertCanSendEmail(inviteUrl ?? undefined);

    // Claim the send slot atomically so concurrent requests cannot bypass the cooldown.
    const previousSentAt = invite.emailSentAt ?? null;
    const claimedAt = new Date();
    const claimed = await this.em.nativeUpdate(
      InviteEntity,
      {
        id,
        $or: [
          { emailSentAt: null },
          {
            emailSentAt: {
              $lte: new Date(claimedAt.getTime() - inviteResendEmailCooldownMs),
            },
          },
        ],
      },
      { emailSentAt: claimedAt },
    );
    if (!claimed) {
      throw AppException.tooManyRequests(
        ApiErrorCode.RATE_LIMITED,
        'Please wait before resending the invite email',
      );
    }

    try {
      await this.sendInviteEmail(invite, currentUser, inviteUrl as string);
    } catch (error) {
      this.logger.warn(
        `Failed to resend invite email to ${invite.email}`,
        error,
      );
      await this.em.nativeUpdate(
        InviteEntity,
        { id },
        { emailSentAt: previousSentAt },
      );
      throw AppException.serviceUnavailable(
        ApiErrorCode.EMAIL_SEND_FAILED,
        'Failed to send invite email',
      );
    }

    await this.em.nativeUpdate(InviteEntity, { id }, { emailSent: true });
    invite.emailSent = true;
    invite.emailSentAt = claimedAt;
    return this.toDto(invite, { url: inviteUrl ?? undefined });
  }

  private assertUsable(invite: InviteEntity): void {
    if (invite.revokedAt) {
      throw AppException.forbidden(
        ApiErrorCode.INVITE_REVOKED,
        'Invite code has been revoked',
      );
    }
    if (invite.usedAt) {
      throw AppException.forbidden(
        ApiErrorCode.INVITE_USED,
        'Invite code has already been used',
      );
    }
    if (new Date() > new Date(invite.expiresAt)) {
      throw AppException.forbidden(
        ApiErrorCode.INVITE_EXPIRED,
        'Invite code has expired',
      );
    }
  }

  private assertCanSendEmail(inviteUrl: string | undefined): void {
    if (!this.mailService.isConfigured) {
      throw AppException.badRequest(
        ApiErrorCode.EMAIL_NOT_CONFIGURED,
        'SMTP is not configured',
      );
    }
    if (!inviteUrl) {
      throw AppException.badRequest(
        ApiErrorCode.EMAIL_SEND_FAILED,
        'APP_URL is not configured',
      );
    }
  }

  private async getBaseUrl(): Promise<string | undefined> {
    const appUrl = await this.settingsService.getValue(ESettingKey.APP_URL);
    return appUrl || undefined;
  }

  private async sendInviteEmail(
    invite: InviteEntity,
    author: GetUserSafeDto,
    inviteUrl: string,
  ): Promise<void> {
    if (!invite.email) {
      return;
    }
    const inviterName = author.fullname || author.username;
    const ttlMs = new Date(invite.expiresAt).getTime() - Date.now();
    const ttlMinutes = Math.max(1, Math.round(ttlMs / 60_000));
    const escapedUrl = this.escapeHtml(inviteUrl);

    const subject = 'Invitation to join Konvoez';
    const textLines = [
      `You have been invited to join Konvoez by ${inviterName}.`,
      '',
      'To accept this invitation and create your account, use the following link:',
      inviteUrl,
      '',
      `Invite code: ${invite.code}`,
      `This invitation expires in ${ttlMinutes} minute(s).`,
      'If you were not expecting this invitation, you can ignore this email.',
    ];

    const htmlParts = [
      `<p>You have been invited to join Konvoez by <strong>${this.escapeHtml(inviterName)}</strong>.</p>`,
      `<p>To accept this invitation and create your account, click the link below:</p>`,
      `<p><a href="${escapedUrl}">${escapedUrl}</a></p>`,
      `<p>Invite code: <strong>${this.escapeHtml(invite.code)}</strong></p>`,
      `<p>This invitation expires in ${ttlMinutes} minute(s).</p>`,
      `<p>If you were not expecting this invitation, you can ignore this email.</p>`,
    ];

    await this.mailService.sendMail({
      to: invite.email,
      subject,
      text: textLines.join('\n'),
      html: htmlParts.join(''),
    });
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
