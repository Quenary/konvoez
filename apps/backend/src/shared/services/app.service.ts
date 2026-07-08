import { Injectable } from '@nestjs/common';
import crypto from 'crypto';

/**
 * App configuration service
 */
@Injectable()
export class AppService {
  /**
   * Master key
   */
  public readonly MASTER_KEY: string | null = process.env['MASTER_KEY'] || null;
  /**
   * Secret for tokens
   */
  public readonly JWT_SECRET: string | Buffer =
    process.env['JWT_SECRET'] || crypto.randomBytes(32);
  /**
   * Access token TTL in minutes
   * @default 15
   */
  public readonly ACCESS_TTL: number = Number(process.env['ACCESS_TTL']) || 15;
  /**
   * Refresh token TTL in minutes
   * @default 10080 (a week)
   */
  public readonly REFRESH_TTL: number =
    Number(process.env['REFRESH_TTL']) || 7 * 24 * 60;
  /**
   * Cookie secure
   * @default false
   */
  public readonly COOKIE_SECURE: boolean =
    process.env['COOKIE_SECURE']?.toLowerCase() === 'true';
  /**
   * Cookie same site
   * @default 'lax'
   */
  public readonly COOKIE_SAME_SITE: 'lax' | 'strict' | 'none' =
    (process.env['COOKIE_SAME_SITE'] as any) || 'lax';
  /**
   * Cookie domain
   * @default undefined
   */
  public readonly COOKIE_DOMAIN: string | undefined =
    process.env['COOKIE_DOMAIN'];

  //#region S3
  public readonly S3_REGION: string | undefined = process.env['S3_REGION'];
  public readonly S3_ENDPOINT: string | undefined = process.env['S3_ENDPOINT'];
  public readonly S3_ACCESS_KEY_ID: string | undefined =
    process.env['S3_ACCESS_KEY_ID'];
  public readonly S3_ACCESS_KEY: string | undefined =
    process.env['S3_ACCESS_KEY'];
  public readonly S3_FORCE_PATH_STYLE: boolean =
    process.env['S3_FORCE_PATH_STYLE']?.toLowerCase() === 'true';
  //#endregion

  //#region MediaSoup
  public readonly MEDIASOUP_ANNOUNCED_IP: string | undefined =
    process.env['MEDIASOUP_ANNOUNCED_IP'];
  //#endregion
}
