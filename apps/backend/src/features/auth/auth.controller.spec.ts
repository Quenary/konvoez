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
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import { AuthLoginDto } from './auth.dto';
import { GetUserDto } from '../users/users.dto';
import { EUserRole } from '@konvoez/shared';
import type { Request, Response } from 'express';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

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
            resolveRefreshToken: jest.fn(),
            setAuthCookies: jest.fn(),
            getMe: jest.fn(),
            isOwnerSetupRequired: jest.fn(),
            register: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  describe('login', () => {
    it('should validate user, set auth cookies and return user', async () => {
      const dto: AuthLoginDto = {
        login: 'testuser',
        password: 'password123',
      };
      authService.validateUser.mockResolvedValueOnce(mockUser);

      const result = await controller.login(
        dto,
        mockResponse as unknown as Response,
      );

      expect(authService.validateUser).toHaveBeenCalledWith(
        'testuser',
        'password123',
      );
      expect(authService.setAuthCookies).toHaveBeenCalledWith(
        mockUser.id,
        mockResponse,
      );

      expect(result).toEqual(mockUser);
    });
  });

  describe('refresh', () => {
    it('should throw UnauthorizedException when refresh token cookie is missing', async () => {
      const req = { cookies: {} } as unknown as Request;

      await expect(
        controller.refresh(req, mockResponse as unknown as Response),
      ).rejects.toThrow(new UnauthorizedException('No refresh token'));
      expect(mockResponse.cookie).not.toHaveBeenCalled();
    });

    it('should verify refresh token, set new cookies, and return ok: true', async () => {
      const req = {
        cookies: { [REFRESH_TOKEN_KEY]: 'valid_refresh_token' },
      } as unknown as Request;
      authService.resolveRefreshToken.mockResolvedValueOnce(mockUser);

      const result = await controller.refresh(
        req,
        mockResponse as unknown as Response,
      );

      expect(authService.resolveRefreshToken).toHaveBeenCalledWith(
        'valid_refresh_token',
      );
      expect(authService.setAuthCookies).toHaveBeenCalledWith(
        mockUser.id,
        mockResponse,
      );
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

  describe('register', () => {
    it('should delegate registration to authService.register and return user', async () => {
      const registerDto = {
        username: 'newuser',
        password: 'Password123!',
        fullname: 'New User',
        email: 'newuser@example.com',
      };
      authService.register.mockResolvedValueOnce(mockUser);

      const result = await controller.register(registerDto);

      expect(authService.register).toHaveBeenCalledWith(registerDto);
      expect(result).toEqual(mockUser);
    });
  });
});
