import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Reflector } from '@nestjs/core';
import { EUserRole } from '@common/enums';
import { AuthGuardRoles } from './auth.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const roles = this.reflector.get<EUserRole[]>(
      AuthGuardRoles,
      context.getHandler(),
    );
    const user = await this.authService.getMe(request);
    if (!roles || roles.includes(user.role)) {
      request['author'] = user; // for GetActor decorator
      return true;
    }
    throw new ForbiddenException('Method forbidden for the user');
  }
}
