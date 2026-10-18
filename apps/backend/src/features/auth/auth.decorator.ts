import { Reflector } from '@nestjs/core';
import { EPermission, EUserRole } from '@konvoez/shared';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { GetUserDto } from '../users/users.dto';

/**
 * Special decorator for auth.guard
 * to allow access only to specific roles.
 * @default all roles
 */
export const AuthGuardRoles = Reflector.createDecorator<EUserRole[]>();

/**
 * Decorator to require specific permissions for the endpoint.
 * Instance owner always bypasses this check.
 */
export const RequirePermissions = Reflector.createDecorator<EPermission[]>();

/**
 * Decorator to require instance owner privileges.
 */
export const RequireOwner = Reflector.createDecorator<true>();

/**
 * On GET, when the access cookie is missing, renew the session from the
 * refresh cookie and continue. Invalid access cookies still fail closed.
 */
export const AuthRefreshFallback = Reflector.createDecorator<true>();

/**
 * Decorator to get current user info as param of the controller method.
 * Controller or method must use AuthGuard
 */
export const Author = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request['author'] as GetUserDto;
  },
);
