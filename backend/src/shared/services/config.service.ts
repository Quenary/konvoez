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
  // S3
  public readonly S3_REGION = process.env['S3_REGION'] || 'ru-east-1';
  public readonly S3_ENDPOINT =
    process.env['S3_ENDPOINT'] || 'http://localhost:9000';
  public readonly S3_ACCESS_KEY_ID = process.env['S3_ACCESS_KEY_ID'] || '';
  public readonly S3_ACCESS_KEY = process.env['S3_ACCESS_KEY'] || '';
  public readonly S3_FORCE_PATH_STYLE =
    process.env['S3_FORCE_PATH_STYLE']?.toLowerCase() === 'true';
}
