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
    UniqueConstraintViolationException: class UniqueConstraintViolationException extends Error {},
  };
});

import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthGuardRoles, AuthRefreshFallback } from './auth.decorator';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import { EUserRole } from '@konvoez/shared';
import { GetUserDto } from '../users/users.dto';
import type { Response } from 'express';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let authService: jest.Mocked<AuthService>;
  let reflector: jest.Mocked<Reflector>;

  const mockUser: GetUserDto = {
    id: 1,
    username: 'testuser',
    fullname: 'Test User',
    email: 'test@example.com',
    role: EUserRole.MEMBER,
    avatar: null,
    avatarUrl: null,
    createdAt: new Date(),
    updatedAt: null,
  };

  const createMockContext = (
    requestObj: Record<string, unknown> = {},
    responseObj: Partial<Response> = {},
  ) => {
    const handlerFn = () => undefined;
    const classType = class MockClass {};
    return {
      switchToHttp: () => ({
        getRequest: () => requestObj,
        getResponse: () => responseObj,
      }),
      getHandler: () => handlerFn,
      getClass: () => classType,
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: AuthService,
          useValue: {
            getMe: jest.fn(),
            resolveRefreshToken: jest.fn(),
            setAuthCookies: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<AuthGuard>(AuthGuard);
    authService = module.get(AuthService);
    reflector = module.get(Reflector);
  });

  describe('canActivate', () => {
    it('should allow access and set request.author when no roles are specified', async () => {
      const request: Record<string, unknown> = {};
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockReturnValueOnce(undefined);
      authService.getMe.mockResolvedValueOnce(mockUser);

      const result = await guard.canActivate(context);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(AuthGuardRoles, [
        context.getHandler(),
        context.getClass(),
      ]);
      expect(authService.getMe).toHaveBeenCalledWith(request);
      expect(request['author']).toEqual(mockUser);
      expect(result).toBe(true);
    });

    it('should allow access and set request.author when user has one of allowed roles', async () => {
      const request: Record<string, unknown> = {};
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockReturnValueOnce([
        EUserRole.MEMBER,
        EUserRole.ADMIN,
      ]);
      authService.getMe.mockResolvedValueOnce(mockUser);

      const result = await guard.canActivate(context);

      expect(request['author']).toEqual(mockUser);
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have an allowed role', async () => {
      const request: Record<string, unknown> = {};
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockReturnValueOnce([EUserRole.ADMIN]);
      authService.getMe.mockResolvedValueOnce(mockUser);

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException('Method forbidden for the user'),
      );
      expect(request['author']).toBeUndefined();
    });

    it('should propagate UnauthorizedException when authService.getMe fails', async () => {
      const request: Record<string, unknown> = {};
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockReturnValueOnce([EUserRole.MEMBER]);
      authService.getMe.mockRejectedValueOnce(
        new UnauthorizedException('Unauthorized'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Unauthorized'),
      );
      expect(request['author']).toBeUndefined();
      expect(authService.resolveRefreshToken).not.toHaveBeenCalled();
      expect(authService.setAuthCookies).not.toHaveBeenCalled();
    });

    it('should renew cookies from the refresh token when the access cookie is missing', async () => {
      const response = { cookie: jest.fn() };
      const request: Record<string, unknown> = {
        method: 'GET',
        cookies: { [REFRESH_TOKEN_KEY]: 'valid_refresh_token' },
      };
      const context = createMockContext(request, response);

      reflector.getAllAndOverride.mockImplementation((key: unknown) => {
        if (key === AuthRefreshFallback) return true;
        return undefined;
      });
      authService.resolveRefreshToken.mockResolvedValueOnce(mockUser);

      const result = await guard.canActivate(context);

      expect(authService.getMe).not.toHaveBeenCalled();
      expect(authService.resolveRefreshToken).toHaveBeenCalledWith(
        'valid_refresh_token',
      );
      expect(authService.setAuthCookies).toHaveBeenCalledWith(
        mockUser.id,
        response,
      );
      expect(request['author']).toEqual(mockUser);
      expect(result).toBe(true);
    });

    it('should reject an invalid access cookie without using the refresh token', async () => {
      const request: Record<string, unknown> = {
        method: 'GET',
        cookies: {
          [ACCESS_TOKEN_KEY]: 'broken',
          [REFRESH_TOKEN_KEY]: 'valid_refresh_token',
        },
      };
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockImplementation((key: unknown) => {
        if (key === AuthRefreshFallback) return true;
        return undefined;
      });
      authService.getMe.mockRejectedValueOnce(
        new UnauthorizedException('Unauthorized'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Unauthorized'),
      );
      expect(authService.resolveRefreshToken).not.toHaveBeenCalled();
      expect(authService.setAuthCookies).not.toHaveBeenCalled();
      expect(request['author']).toBeUndefined();
    });

    it('should reject an access token in the refresh cookie without setting cookies', async () => {
      const response = { cookie: jest.fn() };
      const request: Record<string, unknown> = {
        method: 'GET',
        cookies: { [REFRESH_TOKEN_KEY]: 'access_token' },
      };
      const context = createMockContext(request, response);

      reflector.getAllAndOverride.mockImplementation((key: unknown) => {
        if (key === AuthRefreshFallback) return true;
        return undefined;
      });
      authService.resolveRefreshToken.mockRejectedValueOnce(
        new UnauthorizedException('Unauthorized'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Unauthorized'),
      );
      expect(authService.setAuthCookies).not.toHaveBeenCalled();
      expect(request['author']).toBeUndefined();
    });

    it('should not use the refresh token when the route has no fallback', async () => {
      const request: Record<string, unknown> = {
        method: 'GET',
        cookies: { [REFRESH_TOKEN_KEY]: 'valid_refresh_token' },
      };
      const context = createMockContext(request);

      reflector.getAllAndOverride.mockReturnValue(undefined);
      authService.getMe.mockRejectedValueOnce(
        new UnauthorizedException('Unauthorized'),
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new UnauthorizedException('Unauthorized'),
      );
      expect(authService.getMe).toHaveBeenCalledWith(request);
      expect(authService.resolveRefreshToken).not.toHaveBeenCalled();
      expect(authService.setAuthCookies).not.toHaveBeenCalled();
    });
  });
});
