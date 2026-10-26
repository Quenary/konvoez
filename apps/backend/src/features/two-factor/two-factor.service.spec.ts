import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Cache } from '@nestjs/cache-manager';
import { ApiErrorCode } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { AppService } from '@shared/services/app.service';
import { PasswordService } from '@shared/services/password.service';
import { SecretBoxService } from '@shared/services/secret-box.service';
import { UserEntity } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { TwoFactorService } from './two-factor.service';
import { TwoFactorRecoveryCodeEntity } from './two-factor-recovery-code.entity';
import { totpAt } from './totp.util';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let fakeAppService: AppService;
  let secretBoxService: SecretBoxService;
  let fakePasswordService: Partial<PasswordService>;
  let fakeUsersService: Partial<UsersService>;
  let inMemoryCache: Map<string, unknown>;
  let fakeCacheManager: Partial<Cache>;
  let storedRecoveryCodes: TwoFactorRecoveryCodeEntity[];
  let fakeRecoveryCodeRepo: {
    getEntityManager: () => unknown;
    findOne: (where: unknown) => Promise<TwoFactorRecoveryCodeEntity | null>;
    create: (data: unknown) => TwoFactorRecoveryCodeEntity;
    nativeDelete: (where: unknown) => Promise<number>;
  };

  const masterKey = Buffer.alloc(32, 42).toString('base64');

  function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
    return {
      id: 1,
      username: 'alice',
      password: 'hashed_password',
      email: 'alice@example.com',
      fullname: 'Alice',
      isOwner: false,
      sessionVersion: 1,
      twoFactorSecret: null,
      twoFactorEnabledAt: null,
      twoFactorLastStep: null,
      deletedAt: null,
      ...overrides,
    } as unknown as UserEntity;
  }

  beforeEach(async () => {
    inMemoryCache = new Map();
    storedRecoveryCodes = [];

    fakeAppService = {
      MASTER_KEY: masterKey,
    } as unknown as AppService;

    secretBoxService = new SecretBoxService(fakeAppService);

    fakePasswordService = {
      comparePassword: jest.fn(
        async (plain, _hashed) => plain === 'correct_pass',
      ),
    };

    fakeUsersService = {
      setTwoFactorSecret: jest.fn(async (user, secret) => {
        user.twoFactorSecret = secret;
        user.twoFactorEnabledAt = null;
        user.twoFactorLastStep = null;
        return user;
      }),
      enableTwoFactor: jest.fn(async (user, step) => {
        user.twoFactorEnabledAt = new Date();
        user.twoFactorLastStep = step;
        return user;
      }),
      clearTwoFactor: jest.fn(async (user) => {
        user.twoFactorSecret = null;
        user.twoFactorEnabledAt = null;
        user.twoFactorLastStep = null;
        return user;
      }),
      touchTwoFactorStep: jest.fn(async (user, step) => {
        user.twoFactorLastStep = step;
        return user;
      }),
      revokeSessions: jest.fn(async (user) => {
        user.sessionVersion = (user.sessionVersion ?? 0) + 1;
        return user.sessionVersion;
      }),
      findOne: jest.fn(async (id) => makeUser({ id })),
      toFullDtoWithPermissions: jest.fn(async (user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        fullname: user.fullname,
        isOwner: user.isOwner,
        roles: [],
        permissions: [],
        createdAt: new Date(),
        updatedAt: null,
        avatar: null,
        avatarUrl: null,
        deletedAt: null,
        twoFactorEnabled: user.twoFactorEnabledAt != null,
      })),
    };

    fakeCacheManager = {
      get: jest.fn(async (key: string) => inMemoryCache.get(key)),
      set: jest.fn(async (key: string, val: unknown) => {
        inMemoryCache.set(key, val);
      }),
      del: jest.fn(async (key: string) => {
        inMemoryCache.delete(key);
      }),
    };

    fakeRecoveryCodeRepo = {
      getEntityManager: () => ({
        persist: (entities: unknown) => {
          if (Array.isArray(entities)) {
            storedRecoveryCodes.push(...entities);
          } else if (entities) {
            storedRecoveryCodes.push(entities as TwoFactorRecoveryCodeEntity);
          }
        },
        flush: jest.fn(async () => undefined),
      }),
      findOne: jest.fn(
        async (where: { user: number; codeHash: string; usedAt: null }) => {
          return (
            storedRecoveryCodes.find(
              (c) =>
                c.user.id === where.user &&
                c.codeHash === where.codeHash &&
                c.usedAt === null,
            ) ?? null
          );
        },
      ),
      nativeUpdate: jest.fn(
        async (
          where: { user: number; codeHash: string; usedAt: null },
          data: { usedAt: Date },
        ) => {
          const match = storedRecoveryCodes.find(
            (c) =>
              c.user.id === where.user &&
              c.codeHash === where.codeHash &&
              c.usedAt === null,
          );
          if (match) {
            match.usedAt = data.usedAt;
            return 1;
          }
          return 0;
        },
      ),
      create: (data: unknown) => {
        const entity = {
          id: storedRecoveryCodes.length + 1,
          createdAt: new Date(),
          updatedAt: null,
          usedAt: null,
          ...(data as object),
          user: { id: (data as { user: number }).user } as UserEntity,
        } as TwoFactorRecoveryCodeEntity;
        return entity;
      },
      nativeDelete: jest.fn(async (where: { user: number }) => {
        const initial = storedRecoveryCodes.length;
        storedRecoveryCodes = storedRecoveryCodes.filter(
          (c) => c.user.id !== where.user,
        );
        return initial - storedRecoveryCodes.length;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        { provide: AppService, useValue: fakeAppService },
        { provide: SecretBoxService, useValue: secretBoxService },
        { provide: PasswordService, useValue: fakePasswordService },
        { provide: UsersService, useValue: fakeUsersService },
        { provide: Cache, useValue: fakeCacheManager },
        {
          provide: getRepositoryToken(TwoFactorRecoveryCodeEntity),
          useValue: fakeRecoveryCodeRepo,
        },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
  });

  describe('beginSetup', () => {
    it('requires correct password', async () => {
      const user = makeUser();
      await expect(service.beginSetup(user, 'wrong_pass')).rejects.toThrow(
        AppException,
      );
    });

    it('throws 409 if 2FA is already enabled', async () => {
      const user = makeUser({ twoFactorEnabledAt: new Date() });
      await expect(service.beginSetup(user, 'correct_pass')).rejects.toThrow(
        expect.objectContaining({
          code: ApiErrorCode.AUTH_TWO_FACTOR_ALREADY_ENABLED,
        }),
      );
    });

    it('generates secret and stores encrypted secret in user', async () => {
      const user = makeUser();
      const res = await service.beginSetup(user, 'correct_pass');

      expect(res.secret).toMatch(/^[A-Z2-7]{32}$/);
      expect(res.otpauthUri).toContain(user.username);
      expect(fakeUsersService.setTwoFactorSecret).toHaveBeenCalledWith(
        user,
        expect.stringMatching(/^v1:/),
      );
    });
  });

  describe('confirmSetup', () => {
    it('throws 400 if setup was not started', async () => {
      const user = makeUser({ twoFactorSecret: null });
      await expect(service.confirmSetup(user, '123456')).rejects.toThrow(
        expect.objectContaining({
          code: ApiErrorCode.AUTH_TWO_FACTOR_SETUP_NOT_STARTED,
        }),
      );
    });

    it('rejects wrong code and records failure', async () => {
      const user = makeUser();
      await service.beginSetup(user, 'correct_pass');

      await expect(service.confirmSetup(user, '000000')).rejects.toThrow(
        expect.objectContaining({
          code: ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
        }),
      );
      expect(inMemoryCache.get(`auth:2fa-fails:${user.id}`)).toBe(1);
    });

    it('accepts valid TOTP code, enables 2FA, stores 10 recovery codes, and revokes sessions', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');

      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);

      const res = await service.confirmSetup(user, validCode);

      expect(res.recoveryCodes.length).toBe(10);
      expect(res.sessionVersion).toBe(2);
      expect(fakeUsersService.enableTwoFactor).toHaveBeenCalledWith(
        user,
        currentStep,
      );
      expect(storedRecoveryCodes.length).toBe(10);
      // Plain codes must not be in the database
      for (const entity of storedRecoveryCodes) {
        expect(entity.codeHash.startsWith('v1:')).toBe(true);
        expect(res.recoveryCodes).not.toContain(entity.codeHash);
      }
    });
  });

  describe('verifyLoginCode', () => {
    it('accepts valid 6-digit TOTP code and touches last step', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);
      await service.confirmSetup(user, validCode);

      (fakeUsersService.findOne as jest.Mock).mockResolvedValue(user);

      const nextStep = currentStep + 1;
      const nextCode = totpAt(secret, nextStep);

      await expect(
        service.verifyLoginCode(user.id, nextCode),
      ).resolves.not.toThrow();
      expect(fakeUsersService.touchTwoFactorStep).toHaveBeenCalledWith(
        user,
        nextStep,
      );
    });

    it('accepts recovery code, marks it used, and rejects it on reuse', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);
      const { recoveryCodes } = await service.confirmSetup(user, validCode);

      (fakeUsersService.findOne as jest.Mock).mockResolvedValue(user);

      const oneRecoveryCode = recoveryCodes[0];
      await expect(
        service.verifyLoginCode(user.id, oneRecoveryCode),
      ).resolves.not.toThrow();

      // Second attempt with same code must fail
      await expect(
        service.verifyLoginCode(user.id, oneRecoveryCode),
      ).rejects.toThrow(
        expect.objectContaining({
          code: ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
        }),
      );
    });

    it('locks out user after 5 failed attempts with 429', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);
      await service.confirmSetup(user, validCode);

      (fakeUsersService.findOne as jest.Mock).mockResolvedValue(user);

      for (let i = 0; i < 4; i++) {
        await expect(
          service.verifyLoginCode(user.id, '999999'),
        ).rejects.toThrow(
          expect.objectContaining({
            code: ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
          }),
        );
      }

      // 5th failure triggers lockout
      await expect(
        service.verifyLoginCode(user.id, '999999'),
      ).rejects.toThrow();
      expect(inMemoryCache.get(`auth:2fa-lock:${user.id}`)).toBe(true);

      // Subsequent attempt returns 429 AUTH_TWO_FACTOR_LOCKED without verifying
      await expect(service.verifyLoginCode(user.id, '999999')).rejects.toThrow(
        expect.objectContaining({ code: ApiErrorCode.AUTH_TWO_FACTOR_LOCKED }),
      );
    });

    it('allows exactly one to resolve when 2 parallel calls submit the same valid TOTP', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);
      await service.confirmSetup(user, validCode);

      (fakeUsersService.findOne as jest.Mock).mockResolvedValue(user);

      const nextCode = totpAt(secret, currentStep + 1);
      const results = await Promise.allSettled([
        service.verifyLoginCode(user.id, nextCode),
        service.verifyLoginCode(user.id, nextCode),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
        code: ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
      });
    });
  });

  describe('disable and regenerate', () => {
    it('disables 2FA, clears data, revokes sessions', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);
      await service.confirmSetup(user, validCode);

      const nextCode = totpAt(secret, currentStep + 1);
      const newSv = await service.disable(user, 'correct_pass', nextCode);

      expect(newSv).toBe(3);
      expect(fakeUsersService.clearTwoFactor).toHaveBeenCalledWith(user);
      expect(storedRecoveryCodes.length).toBe(0);
    });

    it('locks out user when 10 parallel disable calls are made with a wrong code', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);
      await service.confirmSetup(user, validCode);

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          service.disable(user, 'correct_pass', '000000'),
        ),
      );

      const invalidCodeErrors = results.filter(
        (r) =>
          r.status === 'rejected' &&
          (r.reason as { code?: string }).code ===
            ApiErrorCode.AUTH_TWO_FACTOR_INVALID_CODE,
      );
      const lockedErrors = results.filter(
        (r) =>
          r.status === 'rejected' &&
          (r.reason as { code?: string }).code ===
            ApiErrorCode.AUTH_TWO_FACTOR_LOCKED,
      );

      expect(invalidCodeErrors.length).toBe(5);
      expect(lockedErrors.length).toBe(5);
    });

    it('regenerates recovery codes, invalidating previous set', async () => {
      const user = makeUser();
      const { secret } = await service.beginSetup(user, 'correct_pass');
      const currentStep = Math.floor(Date.now() / 1000 / 30);
      const validCode = totpAt(secret, currentStep);
      const { recoveryCodes: oldCodes } = await service.confirmSetup(
        user,
        validCode,
      );

      const nextCode = totpAt(secret, currentStep + 1);
      const { recoveryCodes: newCodes } = await service.regenerateRecoveryCodes(
        user,
        'correct_pass',
        nextCode,
      );

      expect(newCodes.length).toBe(10);
      expect(newCodes).not.toEqual(oldCodes);
    });
  });

  describe('adminReset', () => {
    it('clears 2FA and revokes sessions without password check', async () => {
      const target = makeUser({
        twoFactorSecret: 'enc_secret',
        twoFactorEnabledAt: new Date(),
      });

      const res = await service.adminReset(target, 999);
      expect(res.id).toBe(target.id);
      expect(fakeUsersService.clearTwoFactor).toHaveBeenCalledWith(target);
      expect(fakeUsersService.revokeSessions).toHaveBeenCalledWith(target);
    });
  });

  describe('handleUserDeleted event', () => {
    it('deletes recovery codes and clears lockout when user is deleted', async () => {
      storedRecoveryCodes.push({
        id: 1,
        createdAt: new Date(),
        updatedAt: null,
        usedAt: null,
        user: { id: 7 } as UserEntity,
        codeHash: 'hash',
      } as TwoFactorRecoveryCodeEntity);

      await service.handleUserDeleted({ id: 7 });

      expect(fakeRecoveryCodeRepo.nativeDelete).toHaveBeenCalledWith({
        user: 7,
      });
      expect(fakeCacheManager.del).toHaveBeenCalled();
    });
  });

  describe('handleUserUpdated event', () => {
    it('deletes recovery codes when user is deleted/anonymized', async () => {
      storedRecoveryCodes.push({
        id: 1,
        createdAt: new Date(),
        updatedAt: null,
        usedAt: null,
        user: { id: 5 } as UserEntity,
        codeHash: 'hash',
      } as TwoFactorRecoveryCodeEntity);

      await service.handleUserUpdated({
        id: 5,
        username: 'deleted-5',
        fullname: 'Deleted user',
        isOwner: false,
        roles: [],
        permissions: [],
        createdAt: new Date(),
        updatedAt: null,
        avatar: null,
        avatarUrl: null,
        deletedAt: new Date(),
      });

      expect(fakeRecoveryCodeRepo.nativeDelete).toHaveBeenCalledWith({
        user: 5,
      });
    });
  });
});
