import { Reflector } from '@nestjs/core';
import { EUserRole } from '../users/users.enum';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserEntity } from '../users/users.entity';

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
    const request = ctx.switchToHttp().getRequest<Request>();
    return request['author'] as UserEntity;
  },
);
