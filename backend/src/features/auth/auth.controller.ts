import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthLoginDto } from './auth.dto';
import type { Request, Response } from 'express';
import { ConfigService } from 'src/shared/services/config.service';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private configService: ConfigService,
  ) {}

  /**
   * Set auth cookies to the response
   * @param username
   * @param res
   */
  private setCookies(username: string, res: Response): void {
    const accessToken = this.authService.generateToken({
      type: 'access',
      username: username,
    });
    const refreshToken = this.authService.generateToken({
      type: 'refresh',
      username: username,
    });
    res.cookie(ACCESS_TOKEN_KEY, accessToken, {
      httpOnly: true,
      sameSite: this.configService.COOKIE_SAME_SITE,
      secure: this.configService.COOKIE_SECURE,
      domain: this.configService.COOKIE_DOMAIN,
      maxAge: this.configService.ACCESS_TTL * 60,
    });
    res.cookie(REFRESH_TOKEN_KEY, refreshToken, {
      httpOnly: true,
      sameSite: this.configService.COOKIE_SAME_SITE,
      secure: this.configService.COOKIE_SECURE,
      domain: this.configService.COOKIE_DOMAIN,
      maxAge: this.configService.REFRESH_TTL * 60,
    });
  }

  @Post('login')
  async login(
    @Body() dto: AuthLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(
      dto.username,
      dto.password,
    );
    this.setCookies(user.username, res);
    return { ok: true };
  }

  @Post('refresh')
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_KEY];
    if (!refreshToken) {
      throw new UnauthorizedException();
    }
    this.setCookies(refreshToken.username, res);
    return { ok: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_TOKEN_KEY);
    res.clearCookie(REFRESH_TOKEN_KEY);
    return { ok: true };
  }

  @Post('me')
  me(@Req() req: Request) {
    return this.authService.getMe(req);
  }
}
