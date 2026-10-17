import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EPermission, ApiErrorCode, EUserRole } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { AuthService } from './auth.service';
import {
  AuthGuardRoles,
  AuthRefreshFallback,
  RequireOwner,
  RequirePermissions,
} from './auth.decorator';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import type { Request, Response } from 'express';
import { GetUserDto } from '../users/users.dto';
import { PermissionsService } from '../permissions/permissions.service';

interface AuthenticatedRequest extends Request {
  author?: GetUserDto;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const user = await this.resolveUser(
      context,
      request,
      http.getResponse<Response>(),
    );

    const requireOwner = this.reflector.getAllAndOverride<true>(RequireOwner, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requireOwner && !user.isOwner) {
      throw AppException.forbidden(
        ApiErrorCode.AUTH_METHOD_FORBIDDEN,
        'Method forbidden for the user',
      );
    }

    const requiredPermissions = this.reflector.getAllAndOverride<EPermission[]>(
      RequirePermissions,
      [context.getHandler(), context.getClass()],
    );
    if (requiredPermissions && requiredPermissions.length > 0) {
      const allowed = await this.permissionsService.hasAllPermissions(
        user,
        requiredPermissions,
      );
      if (!allowed) {
        throw AppException.forbidden(
          ApiErrorCode.AUTH_METHOD_FORBIDDEN,
          'Method forbidden for the user',
        );
      }
    }

    const roles = this.reflector.getAllAndOverride<EUserRole[]>(
      AuthGuardRoles,
      [context.getHandler(), context.getClass()],
    );
    if (roles && roles.length > 0) {
      const isAllowed =
        user.isOwner || (user.role && roles.includes(user.role));
      if (!isAllowed) {
        throw AppException.forbidden(
          ApiErrorCode.AUTH_METHOD_FORBIDDEN,
          'Method forbidden for the user',
        );
      }
    }

    request.author = user; // for Author decorator
    return true;
  }

  private async resolveUser(
    context: ExecutionContext,
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<GetUserDto> {
    const accessToken = request.cookies?.[ACCESS_TOKEN_KEY];
    const refreshFallback = this.reflector.getAllAndOverride<true>(
      AuthRefreshFallback,
      [context.getHandler(), context.getClass()],
    );
    if (!accessToken && refreshFallback && request.method === 'GET') {
      const refreshToken = request.cookies?.[REFRESH_TOKEN_KEY];
      if (!refreshToken) {
        throw AppException.unauthorized(
          ApiErrorCode.UNAUTHORIZED,
          'Unauthorized',
        );
      }
      const user = await this.authService.resolveRefreshToken(refreshToken);
      this.authService.setAuthCookies(user.id, response);
      return user;
    }
    return await this.authService.getMe(request);
  }
}
