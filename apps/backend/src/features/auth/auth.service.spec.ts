jest.mock('@mikro-orm/nestjs', () => {
  const { Inject } = require('@nestjs/common');
  const getRepositoryToken = (entity: { name?: string } | string) =>
    typeof entity === 'string'
      ? entity
      : `${entity?.name ?? 'Entity'}Repository`;
  return {
    InjectRepository: (entity: { name?: string } | string) =>
      Inject(getRepositoryToken(entity)),
    getRepositoryToken,
  };
});
jest.mock('@mikro-orm/core', () => {
  const createProxy = (): unknown =>
    new Proxy(() => createProxy(), {
      get: () => createProxy(),
      apply: () => createProxy(),
    });
  return {
    defineEntity: () => ({
      class: class {},
      setClass: () => undefined,
      addHook: () => undefined,
    }),
    p: createProxy(),
    Cascade: {},
    raw: (sql: string) => ({ sql, params: [] }),
    EntityManager: class EntityManager {},
    UniqueConstraintViolationException: class UniqueConstraintViolationException extends Error {},
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { JsonWebTokenError } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { TwoFactorService } from '../two-factor/two-factor.service';

import { AppService } from '@shared/services/app.service';
import { HashService } from '@shared/services/hash.service';
import { MailService } from '@shared/services/mail.service';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/users.entity';
import { GetUserFullDto } from '../users/users.dto';
import {
  ApiErrorCode,
  ESettingKey,
  passwordRecoveryRequestCooldownMs,
} from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import { Request, Response } from 'express';
import { Cache } from '@nestjs/cache-manager';
import { SettingsService } from '../settings/settings.service';
import { InvitesService } from '../invites/invites.service';
import { InviteEntity } from '../invites/invites.entity';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { PasswordRecoveryCodeEntity } from './password-recovery-code.entity';
import { EmailVerificationCodeEntity } from './email-verification-code.entity';
import { VerifiedMailerService } from '@shared/services/verified-mailer.service';

import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersDomainEvents } from '../users/users.events';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let appService: jest.Mocked<AppService>;
  let hashService: jest.Mocked<HashService>;
  let mailService: { isConfigured: boolean; sendMail: jest.Mock };
  let usersService: jest.Mocked<UsersService>;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getValue'>>;
  let invitesService: jest.Mocked<Pick<InvitesService, 'validate' | 'consume'>>;
  let cacheManager: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;
  let twoFactorService: { verifyLoginCode: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let userRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
  };
  let recoveryCodeRepo: {
    find: jest.Mock;
    create: jest.Mock;
    assign: jest.Mock;
    nativeUpdate: jest.Mock;
    getEntityManager: jest.Mock;
  };
  let emailVerificationCodeRepo: {
    find: jest.Mock;
    create: jest.Mock;
    assign: jest.Mock;
    nativeUpdate: jest.Mock;
    getEntityManager: jest.Mock;
  };
  let verifiedMailerService: {
    sendNotification: jest.Mock;
  };
  let em: {
    persist: jest.Mock;
    flush: jest.Mock;
    fork: jest.Mock;
  };

  const mockUserDto: GetUserFullDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    email: 'test@example.com',
    isOwner: false,
    roles: [],
    permissions: [],
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
    twoFactorEnabled: false,
    emailVerified: true,
    pendingEmail: null,
  };

  const mockUserEntity = {
    id: 1,
    username: 'test_user',
    password: 'hashed_password',
    fullname: 'Test User',
    email: 'test@example.com',
    isOwner: false,
    sessionVersion: 0,
    avatar: null,
    createdAt: new Date(),
    updatedAt: null,
  } as unknown as UserEntity;

  beforeEach(async () => {
    settingsService = {
      getValue: jest.fn().mockResolvedValue(false),
    };
    invitesService = {
      validate: jest.fn().mockResolvedValue({} as unknown as InviteEntity),
      consume: jest.fn().mockResolvedValue({} as unknown as InviteEntity),
    };
    mailService = {
      isConfigured: true,
      sendMail: jest.fn().mockResolvedValue(undefined),
    };
    em = {
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
      fork: jest.fn(),
      remove: jest.fn(),
    };
    recoveryCodeRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => data),
      assign: jest.fn(),
      nativeUpdate: jest.fn().mockResolvedValue(1),
      getEntityManager: jest.fn().mockReturnValue(em),
    };
    emailVerificationCodeRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((data) => data),
      assign: jest.fn(),
      nativeUpdate: jest.fn().mockResolvedValue(1),
      getEntityManager: jest.fn().mockReturnValue(em),
    };
    em.fork.mockReturnValue({
      getRepository: () => emailVerificationCodeRepo,
      getReference: (_entity: unknown, id: number) => ({ id }),
      persist: em.persist,
      flush: em.flush,
    });
    verifiedMailerService = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    userRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => ({
        ...mockUserEntity,
        ...data,
      })),
    };
    eventEmitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: AppService,
          useValue: {
            JWT_SECRET: 'test-jwt-secret',
            COOKIE_SAME_SITE: 'lax',
            COOKIE_SECURE: false,
            COOKIE_DOMAIN: undefined,
            ACCESS_TTL: 15,
            REFRESH_TTL: 10080,
          },
        },
        {
          provide: HashService,
          useValue: {
            verify: jest.fn(),
            hash: jest.fn().mockResolvedValue('hashed_code'),
          },
        },
        {
          provide: MailService,
          useValue: mailService,
        },
        {
          provide: UsersService,
          useValue: {
            findOneBy: jest.fn(),
            findOneByUsernameOrEmail: jest.fn(),
            findOneByAsFullDto: jest.fn(),
            toSafeDto: jest.fn(),
            toSafeDtoWithPermissions: jest.fn(),
            toFullDtoWithPermissions: jest.fn(),
            toFullDto: jest.fn(
              (
                user: {
                  id: number;
                  email: string;
                  username: string;
                  fullname: string;
                  isOwner: boolean;
                },
                permissions?: unknown,
              ) => ({
                ...mockUserDto,
                id: user.id,
                email: user.email,
                username: user.username,
                fullname: user.fullname,
                isOwner: user.isOwner,
                permissions: permissions ?? mockUserDto.permissions,
              }),
            ),
            count: jest.fn(),
            setPassword: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: settingsService,
        },
        {
          provide: InvitesService,
          useValue: invitesService,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: userRepo,
        },
        {
          provide: getRepositoryToken(PasswordRecoveryCodeEntity),
          useValue: recoveryCodeRepo,
        },
        {
          provide: getRepositoryToken(EmailVerificationCodeEntity),
          useValue: emailVerificationCodeRepo,
        },
        {
          provide: VerifiedMailerService,
          useValue: verifiedMailerService,
        },
        {
          provide: TwoFactorService,
          useValue: {
            verifyLoginCode: jest.fn(),
          },
        },
        {
          provide: Cache,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    appService = module.get(AppService);
    hashService = module.get(HashService);
    usersService = module.get(UsersService);
    twoFactorService = module.get(TwoFactorService);
    cacheManager = module.get(Cache);
  });

  describe('validateUser', () => {
    it('should return user DTO when credentials are valid by username', async () => {
      usersService.findOneByUsernameOrEmail.mockResolvedValueOnce(
        mockUserEntity,
      );
      hashService.verify.mockResolvedValueOnce(true);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      const result = await service.validateUser('test_user', 'password123');

      expect(usersService.findOneByUsernameOrEmail).toHaveBeenCalledWith(
        'test_user',
      );
      expect(hashService.verify).toHaveBeenCalledWith(
        'password123',
        mockUserEntity.password,
      );
      expect(usersService.toFullDtoWithPermissions).toHaveBeenCalledWith(
        mockUserEntity,
      );
      expect(result).toEqual({ user: mockUserDto, sessionVersion: 0 });
    });

    it('should return user DTO when credentials are valid by email', async () => {
      usersService.findOneByUsernameOrEmail.mockResolvedValueOnce(
        mockUserEntity,
      );
      hashService.verify.mockResolvedValueOnce(true);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      const result = await service.validateUser(
        'test@example.com',
        'password123',
      );

      expect(usersService.findOneByUsernameOrEmail).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(result).toEqual({ user: mockUserDto, sessionVersion: 0 });
    });

    it('should pass mixed-case email login through to lookup', async () => {
      usersService.findOneByUsernameOrEmail.mockResolvedValueOnce(
        mockUserEntity,
      );
      hashService.verify.mockResolvedValueOnce(true);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      await service.validateUser('User@Example.COM', 'password123');

      expect(usersService.findOneByUsernameOrEmail).toHaveBeenCalledWith(
        'User@Example.COM',
      );
    });

    it('should trim login before lookup', async () => {
      usersService.findOneByUsernameOrEmail.mockResolvedValueOnce(
        mockUserEntity,
      );
      hashService.verify.mockResolvedValueOnce(true);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      await service.validateUser('  test_user  ', 'password123');

      expect(usersService.findOneByUsernameOrEmail).toHaveBeenCalledWith(
        'test_user',
      );
    });

    it('should throw AppException when findOneByUsernameOrEmail throws', async () => {
      usersService.findOneByUsernameOrEmail.mockRejectedValueOnce(
        new Error('DB error'),
      );

      await expect(
        service.validateUser('test_user', 'password123'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    });

    it('should throw AppException when user is not found', async () => {
      usersService.findOneByUsernameOrEmail.mockResolvedValueOnce(
        null as unknown as UserEntity,
      );

      await expect(
        service.validateUser('not_found', 'password123'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    });

    it('should throw AppException when password does not match', async () => {
      usersService.findOneByUsernameOrEmail.mockResolvedValueOnce(
        mockUserEntity,
      );
      hashService.verify.mockResolvedValueOnce(false);

      await expect(
        service.validateUser('test_user', 'wrong_password'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      });
    });

    it('should throw AppException when the account is deleted', async () => {
      usersService.findOneByUsernameOrEmail.mockResolvedValueOnce({
        ...mockUserEntity,
        deletedAt: new Date(),
      });
      hashService.verify.mockResolvedValueOnce(true);

      await expect(
        service.validateUser('test_user', 'password123'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      });
      expect(usersService.toFullDtoWithPermissions).not.toHaveBeenCalled();
    });
  });

  describe('signToken', () => {
    it('should call jwt.sign with payload, expiresIn and JWT_SECRET', () => {
      jwtService.sign.mockReturnValueOnce('mocked_token');

      const token = service.signToken(1, 0, 'access');

      expect(jwtService.sign).toHaveBeenCalledWith(
        { type: 'access', userId: 1, sv: 0 },
        {
          secret: appService.JWT_SECRET,
          expiresIn: 15 * 60,
          algorithm: 'HS256',
        },
      );
      expect(token).toBe('mocked_token');
    });
  });

  describe('setAuthCookies', () => {
    it('should set access and refresh cookies from signed tokens with matching TTL', () => {
      const res = { cookie: jest.fn() } as unknown as Response;
      jwtService.sign
        .mockReturnValueOnce('access_token_123')
        .mockReturnValueOnce('refresh_token_123');

      service.setAuthCookies(1, 2, res);

      expect(res.cookie).toHaveBeenNthCalledWith(
        1,
        ACCESS_TOKEN_KEY,
        'access_token_123',
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          domain: undefined,
          path: '/',
          maxAge: 15 * 60 * 1000,
        },
      );
      expect(res.cookie).toHaveBeenNthCalledWith(
        2,
        REFRESH_TOKEN_KEY,
        'refresh_token_123',
        {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
          domain: undefined,
          path: '/',
          maxAge: 10080 * 60 * 1000,
        },
      );
    });
  });

  describe('clearAuthCookies', () => {
    it('should clear both auth cookies with matching options', () => {
      const res = { clearCookie: jest.fn() } as unknown as Response;

      service.clearAuthCookies(res);

      expect(res.clearCookie).toHaveBeenNthCalledWith(1, ACCESS_TOKEN_KEY, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        domain: undefined,
        path: '/',
      });
      expect(res.clearCookie).toHaveBeenNthCalledWith(2, REFRESH_TOKEN_KEY, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        domain: undefined,
        path: '/',
      });
    });
  });

  describe('verifyToken', () => {
    it('should verify token with algorithms HS256 and return valid payload with exp and sv', () => {
      const payload = {
        type: 'access' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
        iat: 1234500,
      };
      jwtService.verify.mockReturnValueOnce(payload);

      const result = service.verifyToken('valid_token', 'access');

      expect(jwtService.verify).toHaveBeenCalledWith('valid_token', {
        secret: appService.JWT_SECRET,
        algorithms: ['HS256'],
      });
      expect(result).toEqual(payload);
    });

    it('should reject a token of the wrong type', () => {
      jwtService.verify.mockReturnValueOnce({
        type: 'refresh',
        userId: 1,
        sv: 0,
        exp: 1234567,
      });

      expect(() => service.verifyToken('refresh_token', 'access')).toThrow(
        AppException,
      );
    });

    it('should reject a token missing exp', () => {
      jwtService.verify.mockReturnValueOnce({
        type: 'access',
        userId: 1,
        sv: 0,
      });

      expect(() => service.verifyToken('no_exp_token', 'access')).toThrow(
        AppException,
      );
    });

    it('should reject a token missing sv', () => {
      jwtService.verify.mockReturnValueOnce({
        type: 'access',
        userId: 1,
        exp: 1234567,
      });

      expect(() => service.verifyToken('no_sv_token', 'access')).toThrow(
        AppException,
      );
    });

    it('should reject a malformed or expired token', () => {
      jwtService.verify.mockImplementationOnce(() => {
        throw new JsonWebTokenError('jwt expired');
      });

      expect(() => service.verifyToken('expired_or_garbage', 'access')).toThrow(
        AppException,
      );
    });
  });

  describe('getUserFromAccessToken', () => {
    it('should verify token and return user DTO by user id and sv', async () => {
      const payload = {
        type: 'access' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      const result = await service.getUserFromAccessToken('valid_token');

      expect(jwtService.verify).toHaveBeenCalledWith('valid_token', {
        secret: appService.JWT_SECRET,
        algorithms: ['HS256'],
      });
      expect(usersService.findOneBy).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual(mockUserDto);
    });

    it('should throw UnauthorizedException when sessionVersion mismatches', async () => {
      const payload = {
        type: 'access' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        sessionVersion: 1,
      });

      await expect(
        service.getUserFromAccessToken('valid_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should throw UnauthorizedException when the account is deleted', async () => {
      const payload = {
        type: 'access' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        deletedAt: new Date(),
      });

      await expect(
        service.getUserFromAccessToken('valid_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      const payload = {
        type: 'access' as const,
        userId: 999,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockRejectedValueOnce(
        AppException.notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found'),
      );

      await expect(
        service.getUserFromAccessToken('valid_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should propagate database or unexpected errors when user lookup fails', async () => {
      const payload = {
        type: 'access' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      const dbError = new Error('SQLITE_BUSY: database is locked');
      usersService.findOneBy.mockRejectedValueOnce(dbError);

      await expect(
        service.getUserFromAccessToken('valid_token'),
      ).rejects.toThrow('SQLITE_BUSY: database is locked');
    });

    it('should reject a refresh token presented as an access token', async () => {
      jwtService.verify.mockReturnValueOnce({
        type: 'refresh',
        userId: 1,
        sv: 0,
        exp: 1234567,
      });

      await expect(
        service.getUserFromAccessToken('refresh_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
      expect(usersService.findOneBy).not.toHaveBeenCalled();
    });
  });

  describe('getActiveUserById', () => {
    it('should return user DTO by user id when active', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      const result = await service.getActiveUserById(1);

      expect(usersService.findOneBy).toHaveBeenCalledWith({
        id: 1,
      });
      expect(result).toEqual(mockUserDto);
    });

    it('should throw UnauthorizedException when the account is deleted', async () => {
      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        deletedAt: new Date(),
      });

      await expect(service.getActiveUserById(1)).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      usersService.findOneBy.mockRejectedValueOnce(
        AppException.notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found'),
      );

      await expect(service.getActiveUserById(999)).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should propagate database or unexpected errors when user lookup fails', async () => {
      const dbError = new Error('SQLITE_BUSY: database is locked');
      usersService.findOneBy.mockRejectedValueOnce(dbError);

      await expect(service.getActiveUserById(1)).rejects.toThrow(
        'SQLITE_BUSY: database is locked',
      );
    });
  });

  describe('getMe', () => {
    it('should throw UnauthorizedException when cookies are missing in request', async () => {
      const req = {} as Request;

      await expect(service.getMe(req)).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should throw UnauthorizedException when access token is not in cookies', async () => {
      const req = { cookies: {} } as unknown as Request;

      await expect(service.getMe(req)).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should return user DTO when valid access token is in cookies', async () => {
      const req = {
        cookies: { [ACCESS_TOKEN_KEY]: 'valid_access_token' },
      } as unknown as Request;
      const payload = {
        type: 'access' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      const result = await service.getMe(req);

      expect(result).toEqual(mockUserDto);
    });
  });

  describe('getUserFromRawCookies', () => {
    it('should return null when cookies string is null or undefined or empty', async () => {
      expect(await service.getUserFromRawCookies(null)).toBeNull();
      expect(await service.getUserFromRawCookies(undefined)).toBeNull();
      expect(await service.getUserFromRawCookies('')).toBeNull();
    });

    it('should return null when cookies string does not contain ACCESS_TOKEN_KEY', async () => {
      const result = await service.getUserFromRawCookies(
        'other_cookie=value; another=123',
      );
      expect(result).toBeNull();
    });

    it('should return user DTO when cookies string contains valid access token', async () => {
      const payload = {
        type: 'access' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      const result = await service.getUserFromRawCookies(
        `foo=bar; ${ACCESS_TOKEN_KEY}=raw_valid_token; baz=qux`,
      );

      expect(jwtService.verify).toHaveBeenCalledWith('raw_valid_token', {
        secret: appService.JWT_SECRET,
        algorithms: ['HS256'],
      });
      expect(usersService.findOneBy).toHaveBeenCalledWith({
        id: 1,
      });
      expect(result).toEqual(mockUserDto);
    });
  });

  describe('owner setup token and registration', () => {
    const createDto = {
      username: 'newowner',
      password: 'StrongPassword123!',
      fullname: 'New Owner',
      email: 'owner@example.com',
      setupToken: undefined as string | undefined,
    };

    it('should generate owner token and save to cache with 5 min TTL on bootstrap when user count is 0', async () => {
      usersService.count.mockResolvedValueOnce(0);

      await service.onApplicationBootstrap();

      expect(cacheManager.set).toHaveBeenCalledTimes(1);
      expect(cacheManager.set).toHaveBeenCalledWith(
        service['ownerSetupTokenCacheKey'],
        expect.stringMatching(/^[a-f0-9]{32}$/),
        service['ownerSetupTokenTtl'],
      );
    });

    it('should not generate owner token when user count is greater than 0 on bootstrap', async () => {
      usersService.count.mockResolvedValueOnce(2);

      await service.onApplicationBootstrap();

      expect(cacheManager.set).not.toHaveBeenCalled();
    });

    it('should report isOwnerSetupRequired as true when count is 0 without regenerating token', async () => {
      usersService.count.mockResolvedValueOnce(0);

      const required = await service.isOwnerSetupRequired();

      expect(required).toBe(true);
      expect(cacheManager.set).not.toHaveBeenCalled();
    });

    it('should report isOwnerSetupRequired as false when count is greater than 0 without regenerating token', async () => {
      usersService.count.mockResolvedValueOnce(1);

      const required = await service.isOwnerSetupRequired();

      expect(required).toBe(false);
      expect(cacheManager.set).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when owner setup token has expired from cache', async () => {
      usersService.count.mockResolvedValue(0);
      cacheManager.get.mockResolvedValueOnce(undefined);

      await expect(
        service.register({ ...createDto, setupToken: 'any-token' }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_SETUP_TOKEN_EXPIRED,
      });
    });

    it('should throw ForbiddenException when registering owner with wrong or missing token', async () => {
      usersService.count.mockResolvedValue(0);
      cacheManager.get.mockResolvedValue('valid-token-in-cache');

      await expect(
        service.register({ ...createDto, setupToken: 'wrong-token' }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_SETUP_TOKEN_INVALID,
      });

      await expect(
        service.register({ ...createDto, setupToken: undefined }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_SETUP_TOKEN_INVALID,
      });
    });

    it('should create OWNER user and delete token from cache when registering with valid token on empty DB', async () => {
      const validToken = 'valid-token-in-cache';
      usersService.count.mockResolvedValue(0);
      cacheManager.get.mockResolvedValue(validToken);

      const { email: _ownerEmail, ...ownerPublic } = {
        ...mockUserDto,
        isOwner: true,
      };
      usersService.toSafeDtoWithPermissions.mockResolvedValueOnce(ownerPublic);
      hashService.hash.mockResolvedValueOnce('hashed_password');

      const result = await service.register({
        ...createDto,
        setupToken: validToken,
      });

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: createDto.username,
          email: createDto.email,
          isOwner: true,
          password: 'hashed_password',
        }),
        { persist: true },
      );
      expect(em.flush).toHaveBeenCalled();
      expect(cacheManager.del).toHaveBeenCalledWith(
        service['ownerSetupTokenCacheKey'],
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_CREATED,
        ownerPublic,
      );
      expect(result.isOwner).toBe(true);
      expect(result.email).toBe(createDto.email);
    });

    it('should create MEMBER user and not require setup token when users already exist', async () => {
      usersService.count.mockResolvedValue(1);
      const { email: _memberEmail, ...memberPublic } = {
        ...mockUserDto,
        isOwner: false,
      };

      usersService.toSafeDtoWithPermissions.mockResolvedValueOnce(memberPublic);
      hashService.hash.mockResolvedValueOnce('hashed_password');

      const result = await service.register(createDto);

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: false,
        }),
        { persist: true },
      );
      expect(cacheManager.get).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        UsersDomainEvents.USER_CREATED,
        memberPublic,
      );
      expect(result.email).toBe(createDto.email);
    });

    it('should throw ConflictException when username is already taken', async () => {
      usersService.count.mockResolvedValue(1);
      userRepo.findOne.mockResolvedValueOnce(mockUserEntity);

      await expect(service.register(createDto)).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_USERNAME_TAKEN,
      });
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when email is already taken', async () => {
      usersService.count.mockResolvedValue(1);
      userRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockUserEntity);

      await expect(service.register(createDto)).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_EMAIL_TAKEN,
      });
      expect(userRepo.create).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when INVITE_ONLY_SIGN_UP is true and no invite code provided', async () => {
      usersService.count.mockResolvedValue(1);
      settingsService.getValue.mockResolvedValue(true);

      await expect(service.register(createDto)).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_INVITE_REQUIRED,
      });
    });

    it('should validate and consume invite when INVITE_ONLY_SIGN_UP is true and invite code is provided', async () => {
      usersService.count.mockResolvedValue(1);
      settingsService.getValue.mockResolvedValue(true);

      const mockInvite = {
        code: 'valid-code-123',
      } as unknown as InviteEntity;
      invitesService.validate.mockResolvedValueOnce(mockInvite);

      const createdMember = {
        ...mockUserEntity,
      } as unknown as UserEntity;
      const { email: _inviteEmail, ...memberPublic } = {
        ...mockUserDto,
      };

      userRepo.create.mockReturnValueOnce(createdMember);
      usersService.toSafeDtoWithPermissions.mockResolvedValueOnce(memberPublic);
      hashService.hash.mockResolvedValueOnce('hashed_password');

      const dtoWithCode = { ...createDto, inviteCode: 'valid-code-123' };
      const result = await service.register(dtoWithCode);

      expect(invitesService.validate).toHaveBeenCalledWith(
        'valid-code-123',
        createDto.email,
      );
      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          isOwner: false,
        }),
        { persist: true },
      );
      expect(invitesService.consume).toHaveBeenCalledWith(
        mockInvite,
        createdMember,
      );
      expect(result.isOwner).toBe(false);
    });

    it('should not create user if invite validation fails', async () => {
      usersService.count.mockResolvedValue(1);
      settingsService.getValue.mockResolvedValue(true);
      invitesService.validate.mockRejectedValueOnce(
        AppException.forbidden(
          ApiErrorCode.INVITE_INVALID,
          'Invalid invite code',
        ),
      );

      const dtoWithCode = { ...createDto, inviteCode: 'invalid-code' };

      await expect(service.register(dtoWithCode)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_INVALID,
      });
      expect(userRepo.create).not.toHaveBeenCalled();
      expect(invitesService.consume).not.toHaveBeenCalled();
    });

    it('should remove created user and throw if invite consumption fails', async () => {
      usersService.count.mockResolvedValue(1);
      settingsService.getValue.mockResolvedValue(true);

      const mockInvite = {
        code: 'valid-code-123',
      } as unknown as InviteEntity;
      invitesService.validate.mockResolvedValueOnce(mockInvite);

      const createdMember = {
        ...mockUserEntity,
      } as unknown as UserEntity;
      userRepo.create.mockReturnValueOnce(createdMember);
      hashService.hash.mockResolvedValueOnce('hashed_password');

      invitesService.consume.mockRejectedValueOnce(
        AppException.forbidden(
          ApiErrorCode.INVITE_USED,
          'Invite code has already been used or expired',
        ),
      );

      const dtoWithCode = { ...createDto, inviteCode: 'valid-code-123' };

      await expect(service.register(dtoWithCode)).rejects.toMatchObject({
        code: ApiErrorCode.INVITE_USED,
      });
      expect(em.remove).toHaveBeenCalledWith(createdMember);
      expect(em.flush).toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        UsersDomainEvents.USER_CREATED,
        expect.anything(),
      );
    });
  });

  describe('requestPasswordRecovery', () => {
    it('should throw when SMTP is not configured', async () => {
      Object.defineProperty(mailService, 'isConfigured', { get: () => false });

      await expect(
        service.requestPasswordRecovery({ email: 'test@example.com' }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.EMAIL_NOT_CONFIGURED,
      });
    });

    it('should return ok for unknown email without sending mail', async () => {
      cacheManager.get.mockResolvedValueOnce(undefined);
      usersService.findOneBy.mockRejectedValueOnce(
        Object.assign(new Error('not found'), {
          constructor: { name: 'NotFoundException' },
        }),
      );
      const { NotFoundException } = await import('@nestjs/common');
      usersService.findOneBy.mockReset();
      usersService.findOneBy.mockRejectedValueOnce(
        new NotFoundException('User not found'),
      );

      const result = await service.requestPasswordRecovery({
        email: 'missing@example.com',
      });

      expect(result).toEqual({ ok: true });
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('should create hashed code and send email for known user', async () => {
      cacheManager.get.mockResolvedValueOnce(undefined);
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      settingsService.getValue.mockResolvedValueOnce(600_000);

      const result = await service.requestPasswordRecovery({
        email: 'test@example.com',
      });

      expect(result).toEqual({ ok: true });
      expect(settingsService.getValue).toHaveBeenCalledWith(
        ESettingKey.PASSWORD_RECOVERY_CODE_TTL,
      );
      expect(hashService.hash).toHaveBeenCalled();
      expect(recoveryCodeRepo.create).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Password recovery code',
        }),
      );
    });

    it('should look up user by lowercased email', async () => {
      cacheManager.get.mockResolvedValueOnce(undefined);
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      settingsService.getValue.mockResolvedValueOnce(600_000);

      await service.requestPasswordRecovery({
        email: 'User@Example.COM',
      });

      expect(usersService.findOneBy).toHaveBeenCalledWith({
        email: 'user@example.com',
      });
    });

    it('should return ok without sending mail when the account is deleted', async () => {
      cacheManager.get.mockResolvedValueOnce(undefined);
      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        deletedAt: new Date(),
      });

      const result = await service.requestPasswordRecovery({
        email: 'test@example.com',
      });

      expect(result).toEqual({ ok: true });
      expect(mailService.sendMail).not.toHaveBeenCalled();
      expect(recoveryCodeRepo.create).not.toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalled();
    });

    it('should return ok and set cooldown when user is not found', async () => {
      cacheManager.get.mockResolvedValueOnce(undefined);
      usersService.findOneBy.mockRejectedValueOnce(
        AppException.notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found'),
      );

      const result = await service.requestPasswordRecovery({
        email: 'missing@example.com',
      });

      expect(result).toEqual({ ok: true });
      expect(mailService.sendMail).not.toHaveBeenCalled();
      expect(recoveryCodeRepo.create).not.toHaveBeenCalled();
      expect(cacheManager.set).toHaveBeenCalledWith(
        'auth:password_recovery_cooldown:missing@example.com',
        true,
        passwordRecoveryRequestCooldownMs,
      );
    });
  });

  describe('confirmPasswordRecovery', () => {
    it('should reject invalid code', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      recoveryCodeRepo.find.mockResolvedValueOnce([
        {
          codeHash: 'hash',
          usedAt: null,
        },
      ]);
      hashService.verify.mockResolvedValueOnce(false);

      await expect(
        service.confirmPasswordRecovery({
          email: 'test@example.com',
          code: '123456',
          password: 'Password1234ab',
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_RECOVERY_CODE_INVALID,
      });
      expect(usersService.setPassword).not.toHaveBeenCalled();
    });

    it('should set password when code matches', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      const matched = { codeHash: 'hash', usedAt: null };
      recoveryCodeRepo.find.mockResolvedValueOnce([matched]);
      hashService.verify.mockResolvedValueOnce(true);
      usersService.setPassword.mockResolvedValueOnce(mockUserEntity);

      const result = await service.confirmPasswordRecovery({
        email: 'test@example.com',
        code: '123456',
        password: 'Password1234ab',
      });

      expect(result).toEqual({ ok: true });
      expect(matched.usedAt).toBeInstanceOf(Date);
      expect(usersService.setPassword).toHaveBeenCalledWith(
        1,
        'Password1234ab',
      );
    });

    it('should look up user by lowercased email', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      recoveryCodeRepo.find.mockResolvedValueOnce([
        { codeHash: 'hash', usedAt: null },
      ]);
      hashService.verify.mockResolvedValueOnce(true);
      usersService.setPassword.mockResolvedValueOnce(mockUserEntity);

      await service.confirmPasswordRecovery({
        email: 'User@Example.COM',
        code: '123456',
        password: 'Password1234ab',
      });

      expect(usersService.findOneBy).toHaveBeenCalledWith({
        email: 'user@example.com',
      });
    });

    it('should reject a deleted account without changing the password', async () => {
      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        deletedAt: new Date(),
      });

      await expect(
        service.confirmPasswordRecovery({
          email: 'test@example.com',
          code: '123456',
          password: 'Password1234ab',
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_RECOVERY_CODE_INVALID,
      });
      expect(usersService.setPassword).not.toHaveBeenCalled();
      expect(recoveryCodeRepo.find).not.toHaveBeenCalled();
    });

    it('should reject with AUTH_RECOVERY_CODE_INVALID when user is not found', async () => {
      usersService.findOneBy.mockRejectedValueOnce(
        AppException.notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found'),
      );

      await expect(
        service.confirmPasswordRecovery({
          email: 'missing@example.com',
          code: '123456',
          password: 'Password1234ab',
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_RECOVERY_CODE_INVALID,
      });
      expect(usersService.setPassword).not.toHaveBeenCalled();
      expect(recoveryCodeRepo.find).not.toHaveBeenCalled();
    });

    it('should mark unverified user verified and send security notification upon successful reset', async () => {
      const unverifiedUser = {
        ...mockUserEntity,
        email: 'unverified@example.com',
        emailVerified: false,
        pendingEmail: 'pending@example.com',
      };
      usersService.findOneBy.mockResolvedValueOnce(unverifiedUser);
      recoveryCodeRepo.find.mockResolvedValueOnce([
        {
          id: 1,
          codeHash: 'hashed_123456',
          user: unverifiedUser,
          usedAt: null,
        },
      ]);
      hashService.verify.mockResolvedValueOnce(true);

      const result = await service.confirmPasswordRecovery({
        email: 'unverified@example.com',
        code: '123456',
        password: 'NewStrongPassword123!',
      });

      expect(result).toEqual({ ok: true });
      expect(unverifiedUser.emailVerified).toBe(true);
      expect(unverifiedUser.pendingEmail).toBeNull();
      expect(verifiedMailerService.sendNotification).toHaveBeenCalledWith(
        unverifiedUser,
        expect.objectContaining({
          subject: 'Password reset',
        }),
      );
    });

    it('should increment attempts and burn code when attempts reach max limit', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      const codeRecord = {
        id: 1,
        codeHash: 'hash',
        attempts: 4,
        usedAt: null,
      };
      recoveryCodeRepo.find.mockResolvedValueOnce([codeRecord]);
      hashService.verify.mockResolvedValueOnce(false);

      await expect(
        service.confirmPasswordRecovery({
          email: 'test@example.com',
          code: 'wrong',
          password: 'Password1234ab',
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_RECOVERY_CODE_INVALID,
      });

      expect(recoveryCodeRepo.nativeUpdate).toHaveBeenNthCalledWith(
        1,
        {
          id: 1,
          usedAt: null,
          attempts: { $lt: 5 },
        },
        { attempts: expect.objectContaining({ sql: 'attempts + 1' }) },
      );
      expect(recoveryCodeRepo.nativeUpdate).toHaveBeenNthCalledWith(
        2,
        {
          id: 1,
          usedAt: null,
          attempts: { $gte: 5 },
        },
        { usedAt: expect.any(Date) },
      );
    });

    it('should skip code if nativeUpdate reservation returns 0 (already locked or used)', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      recoveryCodeRepo.find.mockResolvedValueOnce([
        { id: 1, codeHash: 'hash', attempts: 4, usedAt: null },
      ]);
      recoveryCodeRepo.nativeUpdate.mockResolvedValueOnce(0);

      await expect(
        service.confirmPasswordRecovery({
          email: 'test@example.com',
          code: '123456',
          password: 'Password1234ab',
        }),
      ).rejects.toMatchObject({
        code: ApiErrorCode.AUTH_RECOVERY_CODE_INVALID,
      });
      expect(hashService.verify).not.toHaveBeenCalled();
    });
  });

  describe('email verification', () => {
    it('sendVerificationCodeToEmail creates code and sends mail when SMTP is configured', async () => {
      mailService.isConfigured = true;
      const user = { ...mockUserEntity };

      await service.sendVerificationCodeToEmail(user, 'test@example.com');

      expect(emailVerificationCodeRepo.find).toHaveBeenCalledWith({
        user: user.id,
        usedAt: null,
      });
      expect(emailVerificationCodeRepo.create).toHaveBeenCalled();
      expect(em.persist).toHaveBeenCalled();
      expect(em.flush).toHaveBeenCalled();
      expect(mailService.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: 'Email verification code',
        }),
      );
    });

    it('sendVerificationCodeToEmail does nothing when SMTP is not configured', async () => {
      mailService.isConfigured = false;
      const user = { ...mockUserEntity };

      await service.sendVerificationCodeToEmail(user, 'test@example.com');

      expect(emailVerificationCodeRepo.create).not.toHaveBeenCalled();
      expect(mailService.sendMail).not.toHaveBeenCalled();
    });

    it('verifyCodeForUser returns true and marks code used when code matches', async () => {
      const codeRecord = {
        id: 1,
        codeHash: 'hashed_code',
        attempts: 0,
        usedAt: null,
      };
      emailVerificationCodeRepo.find.mockResolvedValueOnce([codeRecord]);
      hashService.verify.mockResolvedValueOnce(true);

      const ok = await service.verifyCodeForUser(
        mockUserEntity.id,
        mockUserEntity.email,
        '123456',
      );

      expect(ok).toBe(true);
      expect(emailVerificationCodeRepo.nativeUpdate).toHaveBeenNthCalledWith(
        1,
        {
          id: 1,
          usedAt: null,
          attempts: { $lt: 5 },
        },
        { attempts: expect.objectContaining({ sql: 'attempts + 1' }) },
      );
      expect(emailVerificationCodeRepo.nativeUpdate).toHaveBeenNthCalledWith(
        2,
        { id: 1, usedAt: null },
        { usedAt: expect.any(Date) },
      );
    });

    it('verifyCodeForUser returns false and reserves an attempt when code is invalid', async () => {
      const codeRecord = {
        id: 1,
        codeHash: 'hashed_code',
        attempts: 0,
        usedAt: null,
      };
      emailVerificationCodeRepo.find.mockResolvedValueOnce([codeRecord]);
      hashService.verify.mockResolvedValueOnce(false);

      const ok = await service.verifyCodeForUser(
        mockUserEntity.id,
        mockUserEntity.email,
        '000000',
      );

      expect(ok).toBe(false);
      expect(emailVerificationCodeRepo.nativeUpdate).toHaveBeenCalledTimes(2);
      expect(emailVerificationCodeRepo.nativeUpdate).toHaveBeenLastCalledWith(
        {
          id: 1,
          usedAt: null,
          attempts: { $gte: 5 },
        },
        { usedAt: expect.any(Date) },
      );
    });

    it('verifyCodeForUser skips a code another request already reserved', async () => {
      emailVerificationCodeRepo.find.mockResolvedValueOnce([
        { id: 1, codeHash: 'hashed_code', attempts: 4, usedAt: null },
      ]);
      emailVerificationCodeRepo.nativeUpdate.mockResolvedValueOnce(0);

      const ok = await service.verifyCodeForUser(
        mockUserEntity.id,
        mockUserEntity.email,
        '123456',
      );

      expect(ok).toBe(false);
      expect(hashService.verify).not.toHaveBeenCalled();
    });

    it('verifyCodeForUser returns false when no attempt remains', async () => {
      emailVerificationCodeRepo.find.mockResolvedValueOnce([]);

      const ok = await service.verifyCodeForUser(
        mockUserEntity.id,
        mockUserEntity.email,
        '123456',
      );

      expect(ok).toBe(false);
      expect(hashService.verify).not.toHaveBeenCalled();
      expect(emailVerificationCodeRepo.nativeUpdate).not.toHaveBeenCalled();
    });

    it('isUserCoolingDown returns cache state for user', async () => {
      cacheManager.get.mockResolvedValueOnce(true);
      expect(await service.isUserCoolingDown(mockUserEntity.id)).toBe(true);

      cacheManager.get.mockResolvedValueOnce(null);
      expect(await service.isUserCoolingDown(mockUserEntity.id)).toBe(false);
    });
  });

  describe('resolveRefreshToken', () => {
    it('should return user DTO and sessionVersion when the account is active and sv matches', async () => {
      const payload = {
        type: 'refresh' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce(mockUserDto);

      await expect(
        service.resolveRefreshToken('refresh_token'),
      ).resolves.toEqual({ user: mockUserDto, sessionVersion: 0 });
    });

    it('should throw UnauthorizedException when sessionVersion mismatches', async () => {
      const payload = {
        type: 'refresh' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        sessionVersion: 1,
      });

      await expect(
        service.resolveRefreshToken('refresh_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should throw UnauthorizedException when the account is deleted', async () => {
      const payload = {
        type: 'refresh' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        deletedAt: new Date(),
      });

      await expect(
        service.resolveRefreshToken('refresh_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      const payload = {
        type: 'refresh' as const,
        userId: 999,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneBy.mockRejectedValueOnce(
        AppException.notFound(ApiErrorCode.USER_NOT_FOUND, 'User not found'),
      );

      await expect(
        service.resolveRefreshToken('refresh_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });

    it('should propagate database or unexpected errors when user lookup fails', async () => {
      const payload = {
        type: 'refresh' as const,
        userId: 1,
        sv: 0,
        exp: 1234567,
      };
      jwtService.verify.mockReturnValueOnce(payload);
      const dbError = new Error('SQLITE_BUSY: database is locked');
      usersService.findOneBy.mockRejectedValueOnce(dbError);

      await expect(
        service.resolveRefreshToken('refresh_token'),
      ).rejects.toThrow('SQLITE_BUSY: database is locked');
    });

    it('should reject an access token presented as a refresh token', async () => {
      jwtService.verify.mockReturnValueOnce({
        type: 'access',
        userId: 1,
        sv: 0,
        exp: 1234567,
      });

      await expect(
        service.resolveRefreshToken('access_token'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
      expect(usersService.findOneBy).not.toHaveBeenCalled();
    });
  });

  describe('Two-factor challenge & completion', () => {
    it('startTwoFactorChallenge stores pending challenge in cache and sets cookie', async () => {
      const mockRes = { cookie: jest.fn() } as unknown as Response;

      await service.startTwoFactorChallenge(42, mockRes);

      expect(cacheManager.set).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:2fa-pending:[a-f0-9]{64}$/),
        42,
        5 * 60 * 1000,
      );
      expect(mockRes.cookie).toHaveBeenCalledWith(
        'two-factor-token',
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          maxAge: 5 * 60 * 1000,
        }),
      );
    });

    it('completeTwoFactorLogin resolves pending challenge, verifies code, and cleans up cache', async () => {
      (cacheManager.get as jest.Mock).mockResolvedValue(42);

      usersService.findOneBy.mockResolvedValueOnce({
        ...mockUserEntity,
        id: 42,
        sessionVersion: 3,
        deletedAt: null,
      } as UserEntity);
      usersService.toFullDtoWithPermissions.mockResolvedValueOnce({
        ...mockUserDto,
        id: 42,
        twoFactorEnabled: true,
      });

      const result = await service.completeTwoFactorLogin(
        'valid_token',
        '123456',
      );

      expect(twoFactorService.verifyLoginCode).toHaveBeenCalledWith(
        42,
        '123456',
      );
      expect(cacheManager.del).toHaveBeenCalled();
      expect(result.user.id).toBe(42);
      expect(result.sessionVersion).toBe(3);
    });

    it('completeTwoFactorLogin throws 401 on missing or expired pending challenge', async () => {
      (cacheManager.get as jest.Mock).mockResolvedValue(null);

      await expect(
        service.completeTwoFactorLogin('expired_token', '123456'),
      ).rejects.toMatchObject({
        code: ApiErrorCode.UNAUTHORIZED,
      });
    });
  });
});
