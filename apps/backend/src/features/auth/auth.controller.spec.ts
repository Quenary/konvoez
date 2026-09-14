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
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AppService } from '@shared/services/app.service';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import { AuthLoginDto, AuthJWTData } from './auth.dto';
import { GetUserDto } from '../users/users.dto';
import { EUserRole } from '@konvoez/shared';
import type { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;
  let appService: AppService;

  const mockUser: GetUserDto = {
    id: 10,
    username: 'testuser',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const mockAppService = {
    COOKIE_SAME_SITE: 'lax' as const,
    COOKIE_SECURE: false,
    COOKIE_DOMAIN: undefined,
    ACCESS_TTL: 15,
    REFRESH_TTL: 10080,
  };

  let mockResponse: jest.Mocked<Partial<Response>>;

  beforeEach(async () => {
    mockResponse = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            validateUser: jest.fn(),
            generateToken: jest.fn(),
            verifyToken: jest.fn(),
            getMe: jest.fn(),
          },
        },
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
    appService = module.get(AppService);
  });

  describe('login', () => {
    it('should validate user, set auth cookies and return user', async () => {
      const dto: AuthLoginDto = {
        username: 'testuser',
        password: 'password123',
      };
      authService.validateUser.mockResolvedValueOnce(mockUser);
      authService.generateToken
        .mockReturnValueOnce('access_token_123')
        .mockReturnValueOnce('refresh_token_123');

      const result = await controller.login(
        dto,
        mockResponse as unknown as Response,
      );

      expect(authService.validateUser).toHaveBeenCalledWith(
        'testuser',
        'password123',
      );
      expect(authService.generateToken).toHaveBeenNthCalledWith(1, {
        type: 'access',
        userId: mockUser.id,
      });
      expect(authService.generateToken).toHaveBeenNthCalledWith(2, {
        type: 'refresh',
        userId: mockUser.id,
      });

      expect(mockResponse.cookie).toHaveBeenNthCalledWith(
        1,
        ACCESS_TOKEN_KEY,
        'access_token_123',
        {
          httpOnly: true,
          sameSite: appService.COOKIE_SAME_SITE,
          secure: appService.COOKIE_SECURE,
          domain: appService.COOKIE_DOMAIN,
          maxAge: appService.ACCESS_TTL * 60 * 1000,
        },
      );
      expect(mockResponse.cookie).toHaveBeenNthCalledWith(
        2,
        REFRESH_TOKEN_KEY,
        'refresh_token_123',
        {
          httpOnly: true,
          sameSite: appService.COOKIE_SAME_SITE,
          secure: appService.COOKIE_SECURE,
          domain: appService.COOKIE_DOMAIN,
          maxAge: appService.REFRESH_TTL * 60 * 1000,
        },
      );

      expect(result).toEqual(mockUser);
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException when refresh token cookie is missing', () => {
      const req = { cookies: {} } as unknown as Request;

      expect(() =>
        controller.refresh(req, mockResponse as unknown as Response),
      ).toThrow(new UnauthorizedException('No refresh token'));
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('should verify refresh token, set new cookies, and return ok: true', () => {
      const req = {
        cookies: { [REFRESH_TOKEN_KEY]: 'valid_refresh_token' },
      } as unknown as Request;
      const tokenData: AuthJWTData = { type: 'refresh', userId: 10 };
      authService.verifyToken.mockReturnValueOnce(tokenData);
      authService.generateToken
        .mockReturnValueOnce('new_access_token')
        .mockReturnValueOnce('new_refresh_token');

      const result = controller.refresh(
        req,
        mockResponse as unknown as Response,
      );

      expect(authService.verifyToken).toHaveBeenCalledWith(
        'valid_refresh_token',
      );
      expect(authService.generateToken).toHaveBeenNthCalledWith(1, {
        type: 'access',
        userId: 10,
      });
      expect(authService.generateToken).toHaveBeenNthCalledWith(2, {
        type: 'refresh',
        userId: 10,
      });
      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('logout', () => {
    it('should clear access and refresh cookies and return ok: true', () => {
      const result = controller.logout(mockResponse as unknown as Response);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_KEY);
      expect(mockResponse.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_KEY);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('me', () => {
    it('should return current user from authService.getMe', async () => {
      const req = {
        cookies: { [ACCESS_TOKEN_KEY]: 'token' },
      } as unknown as Request;
      authService.getMe.mockResolvedValueOnce(mockUser);

      const result = await controller.me(req);

      expect(authService.getMe).toHaveBeenCalledWith(req);
      expect(result).toEqual(mockUser);
    });
  });
});
