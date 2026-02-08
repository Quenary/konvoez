import { Reflector } from '@nestjs/core';
import { EUserRole } from '../users/users.enum';

/**
 * Special decorator for auth.guard
 * to allow access only to specific roles.
 * @default all roles
 */
export const AuthGuardRoles = Reflector.createDecorator<EUserRole[]>();
