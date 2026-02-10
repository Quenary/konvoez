import { Injectable } from '@nestjs/common';
import crypto from 'crypto';

@Injectable()
export class ConfigService {
  public readonly JWT_SECRET =
    process.env['JWT_SECRET'] || crypto.randomBytes(32);
  /**
   * Access token TTL in minutes
   */
  public readonly ACCESS_TTL = Number(process.env['ACCESS_TTL']) || 15;
  /**
   * Refresh token TTL in minutes
   */
  public readonly REFRESH_TTL =
    Number(process.env['REFRESH_TTL']) || 7 * 24 * 60;
  public readonly COOKIE_SECURE: boolean =
    process.env['COOKIE_SECURE']?.toLowerCase() === 'true';
  public readonly COOKIE_SAME_SITE: 'lax' | 'strict' | 'none' =
    (process.env['COOKIE_SAME_SITE'] as any) || 'lax';
  public readonly COOKIE_DOMAIN: string | undefined =
    process.env['COOKIE_DOMAIN'] || undefined;
}
