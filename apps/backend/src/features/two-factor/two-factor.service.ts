import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { Cache } from '@nestjs/cache-manager';
import { OnEvent } from '@nestjs/event-emitter';
import crypto from 'crypto';
import { ApiErrorCode, type IUserSafe } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { AppService } from '@shared/services/app.service';
import { PasswordService } from '@shared/services/password.service';
import { SecretBoxService } from '@shared/services/secret-box.service';
import { deriveAes256KeyFromMasterKey } from '@shared/utils/master-key.util';
import { UserEntity } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { UsersDomainEvents } from '../users/users.events';
import { GetUserFullDto } from '../users/users.dto';
import {
  CROCKFORD_BASE32_ALPHABET,
  CURRENT_RECOVERY_CODE_VERSION,
  get2faFailsCacheKey,
  get2faLockCacheKey,
  RECOVERY_CODES_COUNT,
  TWO_FACTOR_FAIL_LIMIT,
  TWO_FACTOR_LOCKOUT_TTL_MS,
  TWO_FACTOR_RECOVERY_KEY_INFO,
  TWO_FACTOR_SECRET_KEY_INFO,
} from './two-factor.const';
import { buildOtpAuthUri, generateSecret, verifyTotp } from './totp.util';
import { TwoFactorRecoveryCodeEntity } from './two-factor-recovery-code.entity';

@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly em: EntityManager;

  constructor(
    private readonly appService: AppService,
    private readonly secretBoxService: SecretBoxService,
    private readonly passwordService: PasswordService,
    private readonly usersService: UsersService,
    private readonly cacheManager: Cache,
    @InjectRepository(TwoFactorRecoveryCodeEntity)
    private readonly recoveryCodeRepo: EntityRepository<TwoFactorRecoveryCodeEntity>,
  ) {
    this.em = this.recoveryCodeRepo.getEntityManager();
  }

  async beginSetup(
    user: UserEntity,
    password: string,
  ): Promise<{ secret: string; otpauthUri: string }> {
    const validPassword = await this.passwordService.comparePassword(
      password,
      user.password,
    );
    if (!validPassword) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid password',
      );
    }

    if (user.twoFactorEnabledAt != null) {
      throw AppException.conflict(
        ApiErrorCode.AUTH_TWO_FACTOR_ALREADY_ENABLED,
        'Two-factor authentication is already enabled',
      );
    }

    const secret = generateSecret();
    const encryptedSecret = this.secretBoxService.encrypt(
      secret,
      TWO_FACTOR_SECRET_KEY_INFO,
    );

    await this.usersService.setTwoFactorSecret(user, encryptedSecret);

    const otpauthUri = buildOtpAuthUri({
      secret,
      account: user.username,
      issuer: 'Konvoez',
    });

    return { secret, otpauthUri };
  }

  async confirmSetup(
    user: UserEntity,
    code: string,
  ): Promise<{ recoveryCodes: string[]; sessionVersion: number }> {
    await this.assertNotLocked(user.id);

    if (!user.twoFactorSecret || user.twoFactorEnabledAt != null) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_TWO_FACTOR_SETUP_NOT_STARTED,
        'Two-factor setup has not been started',
      );
    }

    const plainSecret = this.secretBoxService.decrypt(
      user.twoFactorSecret,
      TWO_FACTOR_SECRET_KEY_INFO,
    );

    const matchedStep = verifyTotp(
      plainSecret,
      code,
      Date.now(),
      user.twoFactorLastStep,
    );

    if (matchedStep === null) {
      await this.recordFailure(user.id);
      throw AppException.badRequest(
        ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
        'Invalid two-factor code',
      );
    }

    await this.clearLockout(user.id);
    await this.usersService.enableTwoFactor(user, matchedStep);

    const recoveryCodes = await this.generateAndStoreRecoveryCodes(user);
    const sessionVersion = await this.usersService.revokeSessions(user);

    return { recoveryCodes, sessionVersion };
  }

  async verifyLoginCode(userId: number, code: string): Promise<void> {
    await this.assertNotLocked(userId);

    const user = await this.usersService.findOne(userId);
    if (!user.twoFactorEnabledAt || !user.twoFactorSecret) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_TWO_FACTOR_NOT_ENABLED,
        'Two-factor authentication is not enabled',
      );
    }

    const cleanCode = code.trim();

    if (/^\d{6}$/.test(cleanCode)) {
      const plainSecret = this.secretBoxService.decrypt(
        user.twoFactorSecret,
        TWO_FACTOR_SECRET_KEY_INFO,
      );
      const matchedStep = verifyTotp(
        plainSecret,
        cleanCode,
        Date.now(),
        user.twoFactorLastStep,
      );

      if (matchedStep === null) {
        await this.recordFailure(userId);
        throw AppException.unauthorized(
          ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
          'Invalid two-factor code',
        );
      }

      await this.clearLockout(userId);
      await this.usersService.touchTwoFactorStep(user, matchedStep);
      return;
    }

    const normalizedCode = cleanCode.replace(/[-\s]/g, '').toUpperCase();
    const codeHash = this.hashCode(normalizedCode);

    const affected = await this.recoveryCodeRepo.nativeUpdate(
      {
        user: user.id,
        codeHash,
        usedAt: null,
      },
      {
        usedAt: new Date(),
      },
    );

    if (affected === 0) {
      await this.recordFailure(userId);
      throw AppException.unauthorized(
        ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
        'Invalid two-factor code',
      );
    }

    await this.clearLockout(userId);
  }

  async disable(
    user: UserEntity,
    password: string,
    code: string,
  ): Promise<number> {
    await this.assertNotLocked(user.id);

    const validPassword = await this.passwordService.comparePassword(
      password,
      user.password,
    );
    if (!validPassword) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid password',
      );
    }

    if (!user.twoFactorEnabledAt || !user.twoFactorSecret) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_TWO_FACTOR_NOT_ENABLED,
        'Two-factor authentication is not enabled',
      );
    }

    const ok = await this.validateCodeWithoutThrow(user, code);
    if (!ok) {
      await this.recordFailure(user.id);
      throw AppException.badRequest(
        ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
        'Invalid two-factor code',
      );
    }

    await this.clearLockout(user.id);
    await this.usersService.clearTwoFactor(user);
    await this.deleteRecoveryCodes(user.id);
    return await this.usersService.revokeSessions(user);
  }

  async regenerateRecoveryCodes(
    user: UserEntity,
    password: string,
    code: string,
  ): Promise<{ recoveryCodes: string[]; sessionVersion: number }> {
    await this.assertNotLocked(user.id);

    const validPassword = await this.passwordService.comparePassword(
      password,
      user.password,
    );
    if (!validPassword) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_INVALID_CREDENTIALS,
        'Invalid password',
      );
    }

    if (!user.twoFactorEnabledAt || !user.twoFactorSecret) {
      throw AppException.badRequest(
        ApiErrorCode.AUTH_TWO_FACTOR_NOT_ENABLED,
        'Two-factor authentication is not enabled',
      );
    }

    const ok = await this.validateCodeWithoutThrow(user, code);
    if (!ok) {
      await this.recordFailure(user.id);
      throw AppException.badRequest(
        ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
        'Invalid two-factor code',
      );
    }

    await this.clearLockout(user.id);
    const recoveryCodes = await this.generateAndStoreRecoveryCodes(user);
    const sessionVersion = await this.usersService.revokeSessions(user);

    return { recoveryCodes, sessionVersion };
  }

  async adminReset(
    target: UserEntity,
    authorId: number,
  ): Promise<GetUserFullDto> {
    this.logger.log(`2FA reset for user ${target.id} by admin ${authorId}`);

    await this.usersService.clearTwoFactor(target);
    await this.deleteRecoveryCodes(target.id);
    await this.clearLockout(target.id);
    await this.usersService.revokeSessions(target);

    return await this.usersService.toFullDtoWithPermissions(target);
  }

  async deleteRecoveryCodes(userId: number): Promise<void> {
    await this.recoveryCodeRepo.nativeDelete({ user: userId });
  }

  @OnEvent(UsersDomainEvents.USER_UPDATED)
  async handleUserUpdated(payload: IUserSafe): Promise<void> {
    if (payload.deletedAt) {
      await this.deleteRecoveryCodes(payload.id);
      await this.clearLockout(payload.id);
    }
  }

  private async validateCodeWithoutThrow(
    user: UserEntity,
    code: string,
  ): Promise<boolean> {
    const cleanCode = code.trim();
    if (/^\d{6}$/.test(cleanCode)) {
      if (!user.twoFactorSecret) return false;
      const plainSecret = this.secretBoxService.decrypt(
        user.twoFactorSecret,
        TWO_FACTOR_SECRET_KEY_INFO,
      );
      const matchedStep = verifyTotp(
        plainSecret,
        cleanCode,
        Date.now(),
        user.twoFactorLastStep,
      );
      if (matchedStep !== null) {
        await this.usersService.touchTwoFactorStep(user, matchedStep);
        return true;
      }
      return false;
    }

    const normalizedCode = cleanCode.replace(/[-\s]/g, '').toUpperCase();
    const codeHash = this.hashCode(normalizedCode);
    const affected = await this.recoveryCodeRepo.nativeUpdate(
      {
        user: user.id,
        codeHash,
        usedAt: null,
      },
      {
        usedAt: new Date(),
      },
    );

    return affected > 0;
  }

  private async generateAndStoreRecoveryCodes(
    user: UserEntity,
  ): Promise<string[]> {
    await this.deleteRecoveryCodes(user.id);

    const plainCodes: string[] = [];
    const entities: TwoFactorRecoveryCodeEntity[] = [];

    for (let i = 0; i < RECOVERY_CODES_COUNT; i++) {
      let part1 = '';
      let part2 = '';
      for (let j = 0; j < 5; j++) {
        part1 +=
          CROCKFORD_BASE32_ALPHABET[
            crypto.randomInt(0, CROCKFORD_BASE32_ALPHABET.length)
          ];
        part2 +=
          CROCKFORD_BASE32_ALPHABET[
            crypto.randomInt(0, CROCKFORD_BASE32_ALPHABET.length)
          ];
      }
      const formatted = `${part1}-${part2}`;
      plainCodes.push(formatted);

      const codeHash = this.hashCode(`${part1}${part2}`);
      const entity = this.recoveryCodeRepo.create({
        user: user.id,
        codeHash,
      });
      entities.push(entity);
    }

    this.em.persist(entities);
    await this.em.flush();

    return plainCodes;
  }

  private hashCode(normalizedCode: string): string {
    const masterKey = this.appService.MASTER_KEY;
    if (!masterKey) {
      throw new Error('MASTER_KEY is not configured');
    }
    const derivedKey = deriveAes256KeyFromMasterKey(
      masterKey,
      TWO_FACTOR_RECOVERY_KEY_INFO,
    );
    const hmacHex = crypto
      .createHmac('sha256', derivedKey)
      .update(normalizedCode, 'utf8')
      .digest('hex');

    return `${CURRENT_RECOVERY_CODE_VERSION}:${hmacHex}`;
  }

  private async assertNotLocked(userId: number): Promise<void> {
    const isLocked = await this.cacheManager.get(get2faLockCacheKey(userId));
    if (isLocked) {
      throw AppException.tooManyRequests(
        ApiErrorCode.AUTH_TWO_FACTOR_LOCKED,
        'Too many failed two-factor attempts. Temporarily locked for 15 minutes.',
      );
    }
  }

  private async recordFailure(userId: number): Promise<void> {
    const failKey = get2faFailsCacheKey(userId);
    const fails = ((await this.cacheManager.get<number>(failKey)) ?? 0) + 1;

    if (fails >= TWO_FACTOR_FAIL_LIMIT) {
      await this.cacheManager.set(
        get2faLockCacheKey(userId),
        true,
        TWO_FACTOR_LOCKOUT_TTL_MS,
      );
      await this.cacheManager.del(failKey);
      this.logger.warn(`User ${userId} locked out of 2FA for 15 minutes`);
    } else {
      await this.cacheManager.set(failKey, fails, TWO_FACTOR_LOCKOUT_TTL_MS);
    }
  }

  private async clearLockout(userId: number): Promise<void> {
    await this.cacheManager.del(get2faFailsCacheKey(userId));
    await this.cacheManager.del(get2faLockCacheKey(userId));
  }
}
