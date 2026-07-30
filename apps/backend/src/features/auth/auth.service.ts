import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from '@shared/services/password.service';
import { AppService } from '@shared/services/app.service';
import { Request } from 'express';
import { ACCESS_TOKEN_KEY } from './auth.const';
import { AuthJWTData } from './auth.dto';
import { UsersService } from '../users/users.service';
import * as cookie from 'cookie';
import { UserEntity } from '../users/users.entity';
import { GetUserDto } from '../users/users.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly appService: AppService,
    private readonly passwordService: PasswordService,
    private readonly userService: UsersService,
  ) {}

  /**
   * Verify user credentials
   * @param username
   * @param password
   * @returns UserEntity
   * @throws UnauthorizedException
   */
  async validateUser(username: string, password: string): Promise<GetUserDto> {
    let user: UserEntity | null = null;
    try {
      user = await this.userService.findOneBy({ username });
    } catch {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const result = await this.passwordService.comparePassword(
      password,
      user.password,
    );
    if (!result) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.userService.toDto(user);
  }

  generateToken(payload: AuthJWTData): string {
    return this.jwt.sign(payload, {
      secret: this.appService.JWT_SECRET,
    });
  }

  verifyToken(token: string): AuthJWTData {
    return this.jwt.verify<AuthJWTData>(token, {
      secret: this.appService.JWT_SECRET,
    });
  }

  /**
   * Get current user info by access token
   * @param req request
   * @returns
   */
  async getMe(req: Request): Promise<GetUserDto> {
    const accessToken = req.cookies?.[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      throw new UnauthorizedException('Unauthorized');
    }

    return await this.getUserFromAccessToken(accessToken);
  }

  async getUserFromAccessToken(accessToken: string): Promise<GetUserDto> {
    const res = this.verifyToken(accessToken);
    return await this.userService.findOneByAsDto({
      id: res.userId,
    });
  }

  async getUserFromRawCookies(
    cookies: string | null | undefined,
  ): Promise<GetUserDto | null> {
    if (!cookies) {
      return null;
    }
    const parsedCookies = cookie.parse(cookies);
    const accessToken = parsedCookies[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      return null;
    }
    return await this.getUserFromAccessToken(accessToken);
  }
}
