import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { ApiErrorCode } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import { AuthService } from './auth.service';
import {
  AuthLoginDto,
  AuthLoginTwoFactorDto,
  AuthRegisterDto,
  PasswordRecoveryConfirmDto,
  PasswordRecoveryRequestDto,
} from './auth.dto';
import type { Request, Response } from 'express';
import { REFRESH_TOKEN_KEY, TWO_FACTOR_TOKEN_KEY } from './auth.const';
import { ApiOkResponse } from '@nestjs/swagger';
import { GetUserFullDto } from '../users/users.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOkResponse({
    description: 'Logged in user or two-factor requirement indicator',
  })
  async login(
    @Body() dto: AuthLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, sessionVersion } = await this.authService.validateUser(
      dto.login,
      dto.password,
    );
    if (user.twoFactorEnabled) {
      await this.authService.startTwoFactorChallenge(user.id, res);
      return { twoFactorRequired: true };
    }
    this.authService.setAuthCookies(user.id, sessionVersion, res);
    return user;
  }

  @Post('login/2fa')
  @ApiOkResponse({
    type: GetUserFullDto,
    description: 'Complete two-factor authentication challenge',
  })
  async loginTwoFactor(
    @Req() req: Request,
    @Body() dto: AuthLoginTwoFactorDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pendingId = req.cookies?.[TWO_FACTOR_TOKEN_KEY];
    if (!pendingId) {
      throw AppException.unauthorized(
        ApiErrorCode.UNAUTHORIZED,
        'Unauthorized',
      );
    }
    const { user, sessionVersion } =
      await this.authService.completeTwoFactorLogin(pendingId, dto.code);
    this.authService.setAuthCookies(user.id, sessionVersion, res);
    this.authService.clearTwoFactorPendingCookie(res);
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
    const { user, sessionVersion } =
      await this.authService.resolveRefreshToken(refreshToken);
    this.authService.setAuthCookies(user.id, sessionVersion, res);
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    this.authService.clearAuthCookies(res);
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
