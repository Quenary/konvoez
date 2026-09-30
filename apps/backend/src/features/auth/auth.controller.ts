import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AuthLoginDto,
  AuthRegisterDto,
  PasswordRecoveryConfirmDto,
  PasswordRecoveryRequestDto,
} from './auth.dto';
import type { Request, Response } from 'express';
import { AppService } from '@shared/services/app.service';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import { ApiOkResponse } from '@nestjs/swagger';
import { GetUserDto } from '../users/users.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly appService: AppService,
  ) {}

  /**
   * Set auth cookies to the response
   * @param username
   * @param res
   */
  private setCookies(userId: number, res: Response): void {
    const accessToken = this.authService.generateToken({
      type: 'access',
      userId,
    });
    const refreshToken = this.authService.generateToken({
      type: 'refresh',
      userId,
    });
    res.cookie(ACCESS_TOKEN_KEY, accessToken, {
      httpOnly: true,
      sameSite: this.appService.COOKIE_SAME_SITE,
      secure: this.appService.COOKIE_SECURE,
      domain: this.appService.COOKIE_DOMAIN,
      maxAge: this.appService.ACCESS_TTL * 60 * 1000,
    });
    res.cookie(REFRESH_TOKEN_KEY, refreshToken, {
      httpOnly: true,
      sameSite: this.appService.COOKIE_SAME_SITE,
      secure: this.appService.COOKIE_SECURE,
      domain: this.appService.COOKIE_DOMAIN,
      maxAge: this.appService.REFRESH_TTL * 60 * 1000,
    });
  }

  @Post('login')
  @ApiOkResponse({
    type: GetUserDto,
  })
  async login(
    @Body() dto: AuthLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(dto.login, dto.password);
    this.setCookies(user.id, res);
    return user;
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_KEY];
    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token');
    }
    const data = await this.authService.resolveRefreshToken(refreshToken);
    this.setCookies(data.userId, res);
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
    type: GetUserDto,
    description: 'Register a new user (or initial OWNER if setup is required)',
  })
  async register(@Body() dto: AuthRegisterDto): Promise<GetUserDto> {
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
    type: GetUserDto,
    description: 'Get current user',
  })
  async me(@Req() req: Request) {
    return await this.authService.getMe(req);
  }
}
