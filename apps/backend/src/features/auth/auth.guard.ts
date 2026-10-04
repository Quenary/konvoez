import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Reflector } from '@nestjs/core';
import { EUserRole } from '@konvoez/shared';
import { AuthGuardRoles, AuthRefreshFallback } from './auth.decorator';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import type { Request, Response } from 'express';
import { GetUserDto } from '../users/users.dto';

interface AuthenticatedRequest extends Request {
  author?: GetUserDto;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const roles = this.reflector.getAllAndOverride<EUserRole[]>(
      AuthGuardRoles,
      [context.getHandler(), context.getClass()],
    );
    const user = await this.resolveUser(
      context,
      request,
      http.getResponse<Response>(),
    );
    if (!roles || roles.includes(user.role)) {
      request.author = user; // for Author decorator
      return true;
    }
    throw new ForbiddenException('Method forbidden for the user');
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
        throw new UnauthorizedException('Unauthorized');
      }
      const user = await this.authService.resolveRefreshToken(refreshToken);
      this.authService.setAuthCookies(user.id, response);
      return user;
    }
    return await this.authService.getMe(request);
  }
}
