import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EPermission, ApiErrorCode } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { AuthService } from './auth.service';
import {
  AuthRefreshFallback,
  AuthSessionOnly,
  RequireOwner,
  RequirePermissions,
} from './auth.decorator';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import type { Request, Response } from 'express';
import { GetUserFullDto } from '../users/users.dto';
import { PermissionsFacade } from '../permissions/permissions.facade';

interface AuthenticatedRequest extends Request {
  author?: GetUserFullDto;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly permissionsFacade: PermissionsFacade,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const requireOwner = this.reflector.getAllAndOverride<true>(RequireOwner, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<EPermission[]>(
      RequirePermissions,
      [context.getHandler(), context.getClass()],
    );
    const sessionOnly = this.reflector.getAllAndOverride<true>(
      AuthSessionOnly,
      [context.getHandler(), context.getClass()],
    );

    if (
      sessionOnly &&
      !requireOwner &&
      (!requiredPermissions || requiredPermissions.length === 0)
    ) {
      const refreshed = await this.tryRefreshFallback(
        context,
        request,
        response,
      );
      if (!refreshed) {
        await this.authService.verifyAccessSession(request);
      }
      return true;
    }

    const user = await this.resolveUser(context, request, response);

    if (requireOwner && !user.isOwner) {
      throw AppException.forbidden(
        ApiErrorCode.AUTH_METHOD_FORBIDDEN,
        'Method forbidden for the user',
      );
    }

    if (requiredPermissions && requiredPermissions.length > 0) {
      const allowed = await this.permissionsFacade.hasAllPermissions(
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

    request.author = user; // for Author decorator
    return true;
  }

  private async resolveUser(
    context: ExecutionContext,
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<GetUserFullDto> {
    const refreshed = await this.tryRefreshFallback(context, request, response);
    if (refreshed) {
      return refreshed;
    }
    return await this.authService.getMe(request);
  }

  private async tryRefreshFallback(
    context: ExecutionContext,
    request: AuthenticatedRequest,
    response: Response,
  ): Promise<GetUserFullDto | null> {
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
      const { user, sessionVersion } =
        await this.authService.resolveRefreshToken(refreshToken);
      this.authService.setAuthCookies(user.id, sessionVersion, response);
      return user;
    }
    return null;
  }
}
