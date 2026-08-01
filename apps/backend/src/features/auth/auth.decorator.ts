import { Reflector } from '@nestjs/core';
import { EUserRole } from '@konvoez/shared';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { GetUserDto } from '../users/users.dto';

/**
 * Special decorator for auth.guard
 * to allow access only to specific roles.
 * @default all roles
 */
export const AuthGuardRoles = Reflector.createDecorator<EUserRole[]>();

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
