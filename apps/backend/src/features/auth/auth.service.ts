import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PasswordService } from '@shared/services/password.service';
import { AppService } from '@shared/services/app.service';
import { MailService } from '@shared/services/mail.service';
import {
  EntitySyncDomainEvents,
  emitEntitySyncDomainEvent,
} from '@shared/events/entity-sync.events';
import { Request } from 'express';
import { ACCESS_TOKEN_KEY } from './auth.const';
import { AuthJWTData, AuthRegisterDto } from './auth.dto';
import { UsersService } from '../users/users.service';
import * as cookie from 'cookie';
import * as crypto from 'crypto';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import {
  ESettingKey,
  EUserRole,
  IPasswordRecoveryConfirm,
  IPasswordRecoveryRequest,
  passwordRecoveryCodeLength,
  passwordRecoveryRequestCooldownMs,
} from '@konvoez/shared';
import { Cache } from '@nestjs/cache-manager';
import { SettingsService } from '../settings/settings.service';
import { InvitesService } from '../invites/invites.service';
import { InviteEntity } from '../invites/invites.entity';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { PasswordRecoveryCodeEntity } from './password-recovery-code.entity';

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);
  private readonly ownerSetupTokenCacheKey = 'auth:owner_setup_token';
  private readonly ownerSetupTokenTtl = 5 * 60 * 1000; // 5 minutes
  private readonly passwordRecoveryCooldownKeyPrefix =
    'auth:password_recovery_cooldown:';
  private readonly em: EntityManager;

  constructor(
    private readonly jwt: JwtService,
    private readonly appService: AppService,
    private readonly passwordService: PasswordService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
    private readonly invitesService: InvitesService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(UserEntity)
    private readonly userRepo: EntityRepository<UserEntity>,
    @InjectRepository(PasswordRecoveryCodeEntity)
    private readonly recoveryCodeRepo: EntityRepository<PasswordRecoveryCodeEntity>,
    private readonly cacheManager: Cache,
  ) {
    this.em = this.recoveryCodeRepo.getEntityManager();
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.checkAndGenerateOwnerToken();
  }

  async isOwnerSetupRequired(): Promise<boolean> {
    const count = await this.usersService.count();
    return count === 0;
  }

  async register(dto: AuthRegisterDto): Promise<GetUserDto> {
    const isOwnerSetup = await this.isOwnerSetupRequired();
    if (isOwnerSetup) {
      const cachedToken = await this.cacheManager.get<string>(
        this.ownerSetupTokenCacheKey,
      );
      if (!cachedToken) {
        throw new ForbiddenException(
          'Owner setup token has expired. Please restart the instance.',
        );
      }
      if (!dto.setupToken || dto.setupToken !== cachedToken) {
        throw new ForbiddenException('Invalid or missing owner setup token');
      }
      const user = await this.createUser(dto, EUserRole.OWNER);
      await this.cacheManager.del(this.ownerSetupTokenCacheKey);
      this.logger.log(`Owner account created. Setup token consumed.`);
      return this.emitUserCreated(user);
    }

    const inviteOnlySignUp = await this.settingsService.getValue(
      ESettingKey.INVITE_ONLY_SIGN_UP,
    );

    if (inviteOnlySignUp && !dto.inviteCode) {
      throw new ForbiddenException(
        'Registration is only allowed with a valid invite code',
      );
    }

    let invite: InviteEntity | undefined;
    if (dto.inviteCode) {
      invite = await this.invitesService.validate(dto.inviteCode, dto.email);
    }

    const user = await this.createUser(dto, EUserRole.MEMBER);

    if (invite) {
      await this.invitesService.consume(invite, user);
    }

    return this.emitUserCreated(user);
  }

  private emitUserCreated(user: UserEntity): GetUserDto {
    const result = this.usersService.toDto(user);
    emitEntitySyncDomainEvent(
      this.eventEmitter,
      EntitySyncDomainEvents.USER_CREATED,
      result,
    );
    return result;
  }

  private async createUser(
    dto: AuthRegisterDto,
    role: EUserRole,
  ): Promise<UserEntity> {
    const existingUsername = await this.userRepo.findOne({
      username: dto.username,
    });
    if (existingUsername) {
      throw new ConflictException('Username already taken');
    }

    const existingEmail = await this.userRepo.findOne({ email: dto.email });
    if (existingEmail) {
      throw new ConflictException('Email already taken');
    }

    const anyUser = (await this.usersService.count()) > 0;
    if (!anyUser && role !== EUserRole.OWNER) {
      throw new ForbiddenException(
        'Initial setup required: first user must be registered as OWNER with a valid setup token',
      );
    }

    const password = await this.passwordService.hashPassword(dto.password);
    const { setupToken: _, inviteCode: __, ...userData } = dto;
    const user = this.userRepo.create(
      {
        ...userData,
        password,
        role,
      },
      { persist: true },
    );
    await this.em.flush();
    return user;
  }

  /**
   * Verify user credentials by username or email
   * @param login username or email
   * @param password
   * @returns UserEntity
   * @throws UnauthorizedException
   */
  async validateUser(login: string, password: string): Promise<GetUserDto> {
    let user: UserEntity | null;
    try {
      user = await this.usersService.findOneByUsernameOrEmail(login.trim());
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const result = await this.passwordService.comparePassword(
      password,
      user.password,
    );
    if (!result || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.usersService.toDto(user);
  }

  async requestPasswordRecovery(
    dto: IPasswordRecoveryRequest,
  ): Promise<{ ok: true }> {
    if (!this.mailService.isConfigured) {
      throw new ServiceUnavailableException('Email delivery is not configured');
    }

    const email = dto.email.trim().toLowerCase();
    const cooldownKey = `${this.passwordRecoveryCooldownKeyPrefix}${email}`;
    const coolingDown = await this.cacheManager.get<boolean>(cooldownKey);
    if (coolingDown) {
      return { ok: true };
    }

    let user: UserEntity;
    try {
      user = await this.usersService.findOneBy({ email });
    } catch (error) {
      if (error instanceof NotFoundException) {
        // Same response shape; still apply cooldown to limit probing.
        await this.cacheManager.set(
          cooldownKey,
          true,
          passwordRecoveryRequestCooldownMs,
        );
        return { ok: true };
      }
      throw error;
    }

    if (user.deletedAt) {
      await this.cacheManager.set(
        cooldownKey,
        true,
        passwordRecoveryRequestCooldownMs,
      );
      return { ok: true };
    }

    const ttlMs = await this.settingsService.getValue(
      ESettingKey.PASSWORD_RECOVERY_CODE_TTL,
    );
    const code = this.generateRecoveryCode();
    const codeHash = await this.passwordService.hashPassword(code);
    const now = new Date();

    const unusedCodes = await this.recoveryCodeRepo.find({
      user: user.id,
      usedAt: null,
    });
    for (const existing of unusedCodes) {
      this.recoveryCodeRepo.assign(existing, { usedAt: now });
      this.em.persist(existing);
    }

    const recoveryCode = this.recoveryCodeRepo.create({
      user,
      codeHash,
      expiresAt: new Date(now.getTime() + ttlMs),
      usedAt: null,
    });
    this.em.persist(recoveryCode);
    await this.em.flush();

    const ttlMinutes = Math.max(1, Math.round(ttlMs / 60_000));
    try {
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Password recovery code',
        text: `Your Konvoez password recovery code is ${code}. It expires in ${ttlMinutes} minute(s). If you did not request this, you can ignore this email.`,
        html: `<p>Your Konvoez password recovery code is <strong>${code}</strong>.</p><p>It expires in ${ttlMinutes} minute(s).</p><p>If you did not request this, you can ignore this email.</p>`,
      });
    } catch (error) {
      this.recoveryCodeRepo.assign(recoveryCode, { usedAt: new Date() });
      this.em.persist(recoveryCode);
      await this.em.flush();
      throw error;
    }

    await this.cacheManager.set(
      cooldownKey,
      true,
      passwordRecoveryRequestCooldownMs,
    );

    return { ok: true };
  }

  async confirmPasswordRecovery(
    dto: IPasswordRecoveryConfirm,
  ): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    let user: UserEntity;
    try {
      user = await this.usersService.findOneBy({ email });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException('Invalid or expired recovery code');
      }
      throw error;
    }

    if (user.deletedAt) {
      throw new BadRequestException('Invalid or expired recovery code');
    }

    const candidates = await this.recoveryCodeRepo.find(
      {
        user: user.id,
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { orderBy: { createdAt: 'DESC' } },
    );

    let matched: PasswordRecoveryCodeEntity | null = null;
    for (const candidate of candidates) {
      const ok = await this.passwordService.comparePassword(
        dto.code,
        candidate.codeHash,
      );
      if (ok) {
        matched = candidate;
        break;
      }
    }

    if (!matched) {
      throw new BadRequestException('Invalid or expired recovery code');
    }

    matched.usedAt = new Date();
    this.em.persist(matched);
    await this.em.flush();

    await this.usersService.setPassword(user.id, dto.password);
    return { ok: true };
  }

  generateToken(payload: AuthJWTData): string {
    return this.jwt.sign(payload, {
      secret: this.appService.JWT_SECRET,
    });
  }

  verifyToken(token: string): AuthJWTData {
    return this.jwt.verify<AuthJWTData>(token, {
      secret: this.appService.JWT_SECRET,
    });
  }

  /**
   * Get current user info by access token
   * @param req request
   * @returns
   */
  async getMe(req: Request): Promise<GetUserDto> {
    const accessToken = req.cookies?.[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    return await this.getUserFromAccessToken(accessToken);
  }

  async getUserFromAccessToken(accessToken: string): Promise<GetUserDto> {
    const res = this.verifyToken(accessToken);
    return await this.requireActiveUser(res.userId);
  }

  async resolveRefreshToken(refreshToken: string): Promise<AuthJWTData> {
    const data = this.verifyToken(refreshToken);
    await this.requireActiveUser(data.userId);
    return data;
  }

  async getUserFromRawCookies(
    cookies: string | null | undefined,
  ): Promise<GetUserDto | null> {
    if (!cookies) {
      return null;
    }
    const parsedCookies = cookie.parse(cookies);
    const accessToken = parsedCookies[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      return null;
    }
    return await this.getUserFromAccessToken(accessToken);
  }

  private async checkAndGenerateOwnerToken(): Promise<void> {
    const count = await this.usersService.count();
    if (count === 0) {
      const token = crypto.randomBytes(16).toString('hex');
      await this.cacheManager.set(
        this.ownerSetupTokenCacheKey,
        token,
        this.ownerSetupTokenTtl,
      );
      this.logger.warn(`
================================================================================
[OWNER SETUP] Fresh installation detected! No users exist in the database.
[OWNER SETUP] One-time registration token for OWNER account (valid for 5 minutes):
${token}
[OWNER SETUP] If the token expires, restart the instance to generate a new one.
================================================================================
`);
    }
  }

  private generateRecoveryCode(): string {
    const max = 10 ** passwordRecoveryCodeLength;
    const num = crypto.randomInt(0, max);
    return num.toString().padStart(passwordRecoveryCodeLength, '0');
  }

  private async requireActiveUser(userId: number): Promise<GetUserDto> {
    const user = await this.usersService.findOneByAsDto({ id: userId });
    if (user.deletedAt) {
      throw new UnauthorizedException('Unauthorized');
    }
    return user;
  }
}
