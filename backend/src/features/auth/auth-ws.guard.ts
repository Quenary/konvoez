import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { EUserRole } from '@common/enums';
import { AuthGuardRoles } from './auth.decorator';
import { Socket } from 'socket.io';
import * as cookie from 'cookie';
import { ACCESS_TOKEN_KEY } from './auth.const';

@Injectable()
export class AuthWsGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.get<EUserRole[]>(
      AuthGuardRoles,
      context.getHandler(),
    );

    const client: Socket = context.switchToWs().getClient();

    const rawCookies = client.handshake.headers.cookie;
    if (!rawCookies) {
      throw new UnauthorizedException('Unauthorized');
    }

    const parsedCookies = cookie.parse(rawCookies);
    const accessToken = parsedCookies[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    const user = await this.authService.getUserFromAccessToken(accessToken);

    if (!roles || roles.includes(user.role)) {
      client.data.author = user;
      console.log(user);
      return true;
    }

    throw new ForbiddenException('Method forbidden for the user');
  }
}
