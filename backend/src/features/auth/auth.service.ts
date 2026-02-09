// auth.service.ts
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { UserEntity } from '../users/users.entity';
import { PasswordService } from 'src/shared/services/password.service';
import { ConfigService } from 'src/shared/services/config.service';
import { Response, Request } from 'express';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY } from './auth.const';
import { AuthJWTData } from './auth.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
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
  async validateUser(username: string, password: string): Promise<UserEntity> {
    let user: UserEntity | null = null;
    try {
      user = await this.userService.findOneByUsername(username);
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
    return user;
  }

  generateToken(payload: AuthJWTData): string {
    return this.jwt.sign(payload, {
      secret: this.configService.JWT_SECRET,
    });
  }

  verifyToken(token: string): AuthJWTData {
    return this.jwt.verify<AuthJWTData>(token, {
      secret: this.configService.JWT_SECRET,
    });
  }

  /**
   * Get current user info by access token
   * @param req request
   * @returns
   */
  async getMe(req: Request) {
    const accessToken = req.cookies?.[ACCESS_TOKEN_KEY];
    if (!accessToken) {
      throw new UnauthorizedException('Unauthorized');
    }
    const accessTokenData = this.verifyToken(accessToken);
    return await this.userService.findOneByUsername(accessTokenData.username);
  }
}
