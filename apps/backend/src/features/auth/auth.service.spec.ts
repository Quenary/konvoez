jest.mock('@mikro-orm/nestjs', () => ({
  InjectRepository: () => () => undefined,
}));
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
    EntityManager: class EntityManager {},
    UniqueConstraintViolationException: class UniqueConstraintViolationException extends Error {},
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';

import { AppService } from '@shared/services/app.service';
import { PasswordService } from '@shared/services/password.service';
import { UsersService } from '../users/users.service';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';
import { EUserRole } from '@konvoez/shared';
import { ACCESS_TOKEN_KEY } from './auth.const';
import { AuthJWTData } from './auth.dto';
import { Request } from 'express';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { SettingsService } from '../settings/settings.service';
import { InvitesService } from '../invites/invites.service';
import { InviteEntity } from '../invites/invites.entity';

import type { Cache } from 'cache-manager';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let appService: jest.Mocked<AppService>;
  let passwordService: jest.Mocked<PasswordService>;
  let usersService: jest.Mocked<UsersService>;
  let settingsService: jest.Mocked<Pick<SettingsService, 'getValue'>>;
  let invitesService: jest.Mocked<Pick<InvitesService, 'validate' | 'consume'>>;
  let cacheManager: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;

  const mockUserDto: GetUserDto = {
    id: 1,
    username: 'test_user',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockUserEntity = {
    id: 1,
    username: 'test_user',
    password: 'hashed_password',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
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
          },
        },
        {
          provide: PasswordService,
          useValue: {
            comparePassword: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOneBy: jest.fn(),
            findOneByAsDto: jest.fn(),
            toDto: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
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
          provide: CACHE_MANAGER,
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
    passwordService = module.get(PasswordService);
    usersService = module.get(UsersService);
    cacheManager = module.get(CACHE_MANAGER);
  });

  describe('validateUser', () => {
    it('should return user DTO when credentials are valid', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      passwordService.comparePassword.mockResolvedValueOnce(true);
      usersService.toDto.mockReturnValueOnce(mockUserDto);

      const result = await service.validateUser('test_user', 'password123');

      expect(usersService.findOneBy).toHaveBeenCalledWith({
        username: 'test_user',
      });
      expect(passwordService.comparePassword).toHaveBeenCalledWith(
        'password123',
        mockUserEntity.password,
      );
      expect(usersService.toDto).toHaveBeenCalledWith(mockUserEntity);
      expect(result).toEqual(mockUserDto);
    });

    it('should throw UnauthorizedException when findOneBy throws an error', async () => {
      usersService.findOneBy.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        service.validateUser('test_user', 'password123'),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('should throw UnauthorizedException when user is not found', async () => {
      usersService.findOneBy.mockResolvedValueOnce(null);

      await expect(
        service.validateUser('not_found', 'password123'),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('should throw UnauthorizedException when password does not match', async () => {
      usersService.findOneBy.mockResolvedValueOnce(mockUserEntity);
      passwordService.comparePassword.mockResolvedValueOnce(false);

      await expect(
        service.validateUser('test_user', 'wrong_password'),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });
  });

  describe('generateToken', () => {
    it('should call jwt.sign with payload and JWT_SECRET', () => {
      const payload: AuthJWTData = { type: 'access', userId: 1 };
      jwtService.sign.mockReturnValueOnce('mocked_token');

      const token = service.generateToken(payload);

      expect(jwtService.sign).toHaveBeenCalledWith(payload, {
        secret: appService.JWT_SECRET,
      });
      expect(token).toBe('mocked_token');
    });
  });

  describe('verifyToken', () => {
    it('should call jwt.verify with token and JWT_SECRET', () => {
      const payload: AuthJWTData = { type: 'access', userId: 1 };
      jwtService.verify.mockReturnValueOnce(payload);

      const result = service.verifyToken('valid_token');

      expect(jwtService.verify).toHaveBeenCalledWith('valid_token', {
        secret: appService.JWT_SECRET,
      });
      expect(result).toEqual(payload);
    });
  });

  describe('getUserFromAccessToken', () => {
    it('should verify token and return user DTO by user id', async () => {
      const payload: AuthJWTData = { type: 'access', userId: 1 };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneByAsDto.mockResolvedValueOnce(mockUserDto);

      const result = await service.getUserFromAccessToken('valid_token');

      expect(jwtService.verify).toHaveBeenCalledWith('valid_token', {
        secret: appService.JWT_SECRET,
      });
      expect(usersService.findOneByAsDto).toHaveBeenCalledWith({ id: 1 });
      expect(result).toEqual(mockUserDto);
    });
  });

  describe('getMe', () => {
    it('should throw UnauthorizedException when cookies are missing in request', async () => {
      const req = {} as Request;

      await expect(service.getMe(req)).rejects.toThrow(
        new UnauthorizedException('Unauthorized'),
      );
    });

    it('should throw UnauthorizedException when access token is not in cookies', async () => {
      const req = { cookies: {} } as unknown as Request;

      await expect(service.getMe(req)).rejects.toThrow(
        new UnauthorizedException('Unauthorized'),
      );
    });

    it('should return user DTO when valid access token is in cookies', async () => {
      const req = {
        cookies: { [ACCESS_TOKEN_KEY]: 'valid_access_token' },
      } as unknown as Request;
      const payload: AuthJWTData = { type: 'access', userId: 1 };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneByAsDto.mockResolvedValueOnce(mockUserDto);

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
      const payload: AuthJWTData = { type: 'access', userId: 1 };
      jwtService.verify.mockReturnValueOnce(payload);
      usersService.findOneByAsDto.mockResolvedValueOnce(mockUserDto);

      const result = await service.getUserFromRawCookies(
        `foo=bar; ${ACCESS_TOKEN_KEY}=raw_valid_token; baz=qux`,
      );

      expect(jwtService.verify).toHaveBeenCalledWith('raw_valid_token', {
        secret: appService.JWT_SECRET,
      });
      expect(usersService.findOneByAsDto).toHaveBeenCalledWith({ id: 1 });
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
      ).rejects.toThrow(
        new ForbiddenException(
          'Owner setup token has expired. Please restart the instance.',
        ),
      );
    });

    it('should throw ForbiddenException when registering owner with wrong or missing token', async () => {
      usersService.count.mockResolvedValue(0);
      cacheManager.get.mockResolvedValue('valid-token-in-cache');

      await expect(
        service.register({ ...createDto, setupToken: 'wrong-token' }),
      ).rejects.toThrow(
        new ForbiddenException('Invalid or missing owner setup token'),
      );

      await expect(
        service.register({ ...createDto, setupToken: undefined }),
      ).rejects.toThrow(
        new ForbiddenException('Invalid or missing owner setup token'),
      );
    });

    it('should create OWNER user and delete token from cache when registering with valid token on empty DB', async () => {
      const validToken = 'valid-token-in-cache';
      usersService.count.mockResolvedValue(0);
      cacheManager.get.mockResolvedValue(validToken);

      const createdOwner = {
        ...mockUserEntity,
        role: EUserRole.OWNER,
        username: createDto.username,
      } as unknown as UserEntity;
      const ownerDto = { ...mockUserDto, role: EUserRole.OWNER };

      usersService.create.mockResolvedValueOnce(createdOwner);
      usersService.toDto.mockReturnValueOnce(ownerDto);

      const result = await service.register({
        ...createDto,
        setupToken: validToken,
      });

      expect(usersService.create).toHaveBeenCalledWith(
        { ...createDto, setupToken: validToken },
        EUserRole.OWNER,
      );
      expect(cacheManager.del).toHaveBeenCalledWith(
        service['ownerSetupTokenCacheKey'],
      );
      expect(result.role).toBe(EUserRole.OWNER);
    });

    it('should create MEMBER user and not require setup token when users already exist', async () => {
      usersService.count.mockResolvedValue(1);
      const createdMember = {
        ...mockUserEntity,
        role: EUserRole.MEMBER,
      } as unknown as UserEntity;
      const memberDto = { ...mockUserDto, role: EUserRole.MEMBER };

      usersService.create.mockResolvedValueOnce(createdMember);
      usersService.toDto.mockReturnValueOnce(memberDto);

      const result = await service.register(createDto);

      expect(usersService.create).toHaveBeenCalledWith(
        createDto,
        EUserRole.MEMBER,
      );
      expect(cacheManager.get).not.toHaveBeenCalled();
      expect(result.role).toBe(EUserRole.MEMBER);
    });

    it('should throw ForbiddenException when INVITE_ONLY_SIGN_UP is true and no invite code provided', async () => {
      usersService.count.mockResolvedValue(1);
      settingsService.getValue.mockResolvedValue(true);

      await expect(service.register(createDto)).rejects.toThrow(
        new ForbiddenException(
          'Registration is only allowed with a valid invite code',
        ),
      );
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
        role: EUserRole.MEMBER,
      } as unknown as UserEntity;
      const memberDto = { ...mockUserDto, role: EUserRole.MEMBER };

      usersService.create.mockResolvedValueOnce(createdMember);
      usersService.toDto.mockReturnValueOnce(memberDto);

      const dtoWithCode = { ...createDto, inviteCode: 'valid-code-123' };
      const result = await service.register(dtoWithCode);

      expect(invitesService.validate).toHaveBeenCalledWith(
        'valid-code-123',
        createDto.email,
      );
      expect(usersService.create).toHaveBeenCalledWith(
        dtoWithCode,
        EUserRole.MEMBER,
      );
      expect(invitesService.consume).toHaveBeenCalledWith(
        mockInvite,
        createdMember,
      );
      expect(result.role).toBe(EUserRole.MEMBER);
    });

    it('should not create user if invite validation fails', async () => {
      usersService.count.mockResolvedValue(1);
      settingsService.getValue.mockResolvedValue(true);
      invitesService.validate.mockRejectedValueOnce(
        new ForbiddenException('Invalid invite code'),
      );

      const dtoWithCode = { ...createDto, inviteCode: 'invalid-code' };

      await expect(service.register(dtoWithCode)).rejects.toThrow(
        ForbiddenException,
      );
      expect(usersService.create).not.toHaveBeenCalled();
      expect(invitesService.consume).not.toHaveBeenCalled();
    });
  });
});
