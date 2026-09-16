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
import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { AuthGuardRoles } from './auth.decorator';
import { EUserRole } from '@konvoez/shared';
import { GetUserDto } from '../users/users.dto';

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

  const createMockContext = (requestObj: Record<string, unknown> = {}) => {
    const handlerFn = () => undefined;
    const classType = class MockClass {};
    return {
      switchToHttp: () => ({
        getRequest: () => requestObj,
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
    });
  });
});
