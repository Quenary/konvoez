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
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let appService: jest.Mocked<AppService>;
  let passwordService: jest.Mocked<PasswordService>;
  let usersService: jest.Mocked<UsersService>;

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
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    appService = module.get(AppService);
    passwordService = module.get(PasswordService);
    usersService = module.get(UsersService);
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
});
