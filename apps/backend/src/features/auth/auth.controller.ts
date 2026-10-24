import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiErrorCode } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { AuthService } from './auth.service';
import {
  AuthLoginDto,
  AuthRegisterDto,
  PasswordRecoveryConfirmDto,
  PasswordRecoveryRequestDto,
} from './auth.dto';
import type { Request, Response } from 'express';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import { ApiOkResponse } from '@nestjs/swagger';
import { GetUserFullDto } from '../users/users.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOkResponse({
    type: GetUserFullDto,
  })
  async login(
    @Body() dto: AuthLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.login, dto.password);
    this.authService.setAuthCookies(user.id, res);
    return user;
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_KEY];
    if (!refreshToken) {
      throw AppException.unauthorized(
        ApiErrorCode.AUTH_NO_REFRESH_TOKEN,
        'No refresh token',
      );
    }
    const user = await this.authService.resolveRefreshToken(refreshToken);
    this.authService.setAuthCookies(user.id, res);
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_KEY);
    res.clearCookie(REFRESH_TOKEN_KEY);
    return { ok: true };
  }

  @Post('register')
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Register a new user (or initial OWNER if setup is required)',
  })
  async register(@Body() dto: AuthRegisterDto): Promise<GetUserFullDto> {
    return await this.authService.register(dto);
  }

  @Post('password-recovery/request')
  @ApiOkResponse({
    description: 'Request a password recovery code by email',
  })
  async requestPasswordRecovery(
    @Body() dto: PasswordRecoveryRequestDto,
  ): Promise<{ ok: true }> {
    return await this.authService.requestPasswordRecovery(dto);
  }

  @Post('password-recovery/confirm')
  @ApiOkResponse({
    description: 'Confirm password recovery with email, code, and new password',
  })
  async confirmPasswordRecovery(
    @Body() dto: PasswordRecoveryConfirmDto,
  ): Promise<{ ok: true }> {
    return await this.authService.confirmPasswordRecovery(dto);
  }

  @Get('me')
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Get current user',
  })
  async me(@Req() req: Request) {
    return await this.authService.getMe(req);
  }
}
