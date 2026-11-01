import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiErrorCode, EUserRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { UsersDomainEvents, emitUsersDomainEvent } from '../users/users.events';
import { UserEntity } from '../users/users.entity';
import { GetUserSafeDto, GetUserFullDto } from '../users/users.dto';
import { UsersService } from '../users/users.service';
import { RoomsFacade } from '../rooms/rooms.facade';
import { AuthService } from '../auth/auth.service';
import { MailService } from '@shared/services/mail.service';
import { VerifiedMailerService } from '@shared/services/verified-mailer.service';
import { UpdateProfileDto } from './profile.dto';

@Injectable()
export class ProfileService {
  private readonly em: EntityManager;

  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: EntityRepository<UserEntity>,
    private readonly usersService: UsersService,
    private readonly roomsFacade: RoomsFacade,
    private readonly eventEmitter: EventEmitter2,
    private readonly authService: AuthService,
    private readonly mailService: MailService,
    private readonly verifiedMailerService: VerifiedMailerService,
  ) {
    this.em = this.repo.getEntityManager();
  }

  async updateSelf(
    author: GetUserSafeDto,
    dto: UpdateProfileDto,
  ): Promise<{ user: GetUserFullDto; sessionVersion?: number }> {
    if (dto.username) {
      const existingUsername = await this.repo.findOne({
        username: dto.username,
        id: { $ne: author.id },
      });
      if (existingUsername) {
        throw AppException.conflict(
          ApiErrorCode.AUTH_USERNAME_TAKEN,
          'Username already taken',
        );
      }
    }

    const user = await this.usersService.findOne(author.id);

    if (dto.email) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existingEmail = await this.repo.findOne({
        email: normalizedEmail,
        id: { $ne: author.id },
      });
      if (existingEmail) {
        throw AppException.conflict(
          ApiErrorCode.AUTH_EMAIL_TAKEN,
          'Email already taken',
        );
      }

      if (normalizedEmail !== user.email.toLowerCase()) {
        if (this.mailService.isConfigured) {
          const isCoolingDown = await this.authService.isUserCoolingDown(
            user.id,
          );
          if (isCoolingDown) {
            throw AppException.tooManyRequests(
              ApiErrorCode.RATE_LIMITED,
              'Please wait before requesting another verification code',
            );
          }
          await this.authService.sendVerificationCodeToEmail(
            user,
            normalizedEmail,
          );
          user.pendingEmail = normalizedEmail;
        } else {
          user.email = normalizedEmail;
          user.emailVerified = false;
          user.pendingEmail = null;
        }
      }
    }

    const { password, email: _, ...data } = dto;
    this.repo.assign(user, data);

    let sessionVersion: number | undefined;
    if (password) {
      await this.usersService.setPassword(user, password);
      sessionVersion = user.sessionVersion;

      await this.verifiedMailerService.sendNotification(user, {
        subject: 'Password changed',
        text: 'Your Konvoez account password has been changed successfully.',
        html: '<p>Your Konvoez account password has been changed successfully.</p>',
      });
    } else {
      this.em.persist(user);
      await this.em.flush();
    }

    const publicDto = await this.usersService.toSafeDtoWithPermissions(user);
    emitUsersDomainEvent(
      this.eventEmitter,
      UsersDomainEvents.USER_UPDATED,
      publicDto,
    );
    return {
      user: this.usersService.toFullDto(user, publicDto.permissions),
      sessionVersion,
    };
  }

  async requestEmailVerification(
    author: GetUserSafeDto,
  ): Promise<{ ok: true }> {
    if (!this.mailService.isConfigured) {
      throw AppException.serviceUnavailable(
        ApiErrorCode.EMAIL_NOT_CONFIGURED,
        'Email delivery is not configured',
      );
    }
    const user = await this.usersService.findOne(author.id);
    if (user.emailVerified) {
      return { ok: true };
    }
    const isCoolingDown = await this.authService.isUserCoolingDown(user.id);
    if (isCoolingDown) {
      throw AppException.tooManyRequests(
        ApiErrorCode.RATE_LIMITED,
        'Please wait before requesting another verification code',
      );
    }
    await this.authService.sendVerificationCodeToEmail(user, user.email);
    return { ok: true };
  }

  async confirmEmailVerification(
    author: GetUserSafeDto,
    code: string,
  ): Promise<GetUserFullDto> {
    const user = await this.usersService.findOne(author.id);
    if (user.emailVerified) {
      return await this.usersService.toFullDtoWithPermissions(user);
    }
    const ok = await this.authService.verifyCodeForUser(
      user.id,
      user.email,
      code,
    );
    if (!ok) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_EMAIL_VERIFICATION_CODE_INVALID,
        'Invalid or expired verification code',
      );
    }
    user.emailVerified = true;
    this.em.persist(user);
    await this.em.flush();

    const publicDto = await this.usersService.toSafeDtoWithPermissions(user);
    emitUsersDomainEvent(
      this.eventEmitter,
      UsersDomainEvents.USER_UPDATED,
      publicDto,
    );
    return this.usersService.toFullDto(user, publicDto.permissions);
  }

  async confirmEmailChange(
    author: GetUserSafeDto,
    code: string,
  ): Promise<GetUserFullDto> {
    const user = await this.usersService.findOne(author.id);
    if (!user.pendingEmail) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_EMAIL_NO_PENDING_CHANGE,
        'No pending email change found',
      );
    }

    const existingEmail = await this.repo.findOne({
      email: user.pendingEmail,
      id: { $ne: user.id },
    });
    if (existingEmail) {
      throw AppException.conflict(
        ApiErrorCode.AUTH_EMAIL_TAKEN,
        'Email already taken',
      );
    }

    const ok = await this.authService.verifyCodeForUser(
      user.id,
      user.pendingEmail,
      code,
    );
    if (!ok) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_EMAIL_VERIFICATION_CODE_INVALID,
        'Invalid or expired verification code',
      );
    }

    const oldEmail = user.email;
    const oldEmailVerified = user.emailVerified;
    const newEmail = user.pendingEmail;

    user.email = newEmail;
    user.pendingEmail = null;
    user.emailVerified = true;
    this.em.persist(user);
    await this.em.flush();

    if (oldEmailVerified) {
      await this.verifiedMailerService.sendNotification(
        { email: oldEmail, emailVerified: true },
        {
          subject: 'Email address changed',
          text: `Your Konvoez account email has been changed to ${newEmail}.`,
          html: `<p>Your Konvoez account email has been changed to <strong>${newEmail}</strong>.</p>`,
        },
      );
    }

    await this.verifiedMailerService.sendNotification(
      { email: newEmail, emailVerified: true },
      {
        subject: 'Email address updated',
        text: 'Your Konvoez account email has been updated successfully.',
        html: '<p>Your Konvoez account email has been updated successfully.</p>',
      },
    );

    const publicDto = await this.usersService.toSafeDtoWithPermissions(user);
    emitUsersDomainEvent(
      this.eventEmitter,
      UsersDomainEvents.USER_UPDATED,
      publicDto,
    );
    return this.usersService.toFullDto(user, publicDto.permissions);
  }

  async resendEmailChange(author: GetUserSafeDto): Promise<{ ok: true }> {
    if (!this.mailService.isConfigured) {
      throw AppException.serviceUnavailable(
        ApiErrorCode.EMAIL_NOT_CONFIGURED,
        'Email delivery is not configured',
      );
    }
    const user = await this.usersService.findOne(author.id);
    if (!user.pendingEmail) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_EMAIL_NO_PENDING_CHANGE,
        'No pending email change found',
      );
    }
    const isCoolingDown = await this.authService.isUserCoolingDown(user.id);
    if (isCoolingDown) {
      throw AppException.tooManyRequests(
        ApiErrorCode.RATE_LIMITED,
        'Please wait before requesting another verification code',
      );
    }
    await this.authService.sendVerificationCodeToEmail(user, user.pendingEmail);
    return { ok: true };
  }

  async cancelEmailChange(author: GetUserSafeDto): Promise<GetUserFullDto> {
    const user = await this.usersService.findOne(author.id);
    if (!user.pendingEmail) {
      return await this.usersService.toFullDtoWithPermissions(user);
    }
    user.pendingEmail = null;
    await this.authService.cancelPendingVerificationCodes(user.id);
    this.em.persist(user);
    await this.em.flush();

    const publicDto = await this.usersService.toSafeDtoWithPermissions(user);
    emitUsersDomainEvent(
      this.eventEmitter,
      UsersDomainEvents.USER_UPDATED,
      publicDto,
    );
    return this.usersService.toFullDto(user, publicDto.permissions);
  }

  async anonymizeSelf(author: GetUserSafeDto): Promise<GetUserFullDto> {
    this.assertNotOwner(author);
    const user = await this.usersService.findOne(author.id);
    return await this.usersService.anonymizeLoaded(user);
  }

  async removeSelf(author: GetUserSafeDto): Promise<void> {
    this.assertNotOwner(author);
    await this.roomsFacade.deleteRoomsByAuthor(author.id);
    await this.usersService.removeLoaded(author.id);
  }

  private assertNotOwner(author: GetUserSafeDto): void {
    if (author.isOwner || author.role === EUserRole.OWNER) {
      throw AppException.forbidden(
        ApiErrorCode.USER_OWNER_DELETE_FORBIDDEN,
        'Owner account cannot be deleted',
      );
    }
  }
}
