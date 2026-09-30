import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import {
  getDefaultDataDir,
  getDefaultLocalStoragePath,
} from '../storage.utils';

export type FileServiceType = 'local' | 's3';

export type SmtpEncryption = 'TLS' | 'STARTTLS' | null;

/**
 * App configuration service
 */
@Injectable()
export class AppService {
  //#region Storage
  /**
   * Object storage type ('local' or 's3')
   * @default 'local'
   */
  public readonly OBJECT_STORAGE: FileServiceType =
    process.env['OBJECT_STORAGE']?.toLowerCase() === 's3' ? 's3' : 'local';
  /**
   * Local directory path for object storage
   */
  public readonly LOCAL_OBJECT_STORAGE_PATH: string =
    process.env['LOCAL_OBJECT_STORAGE_PATH'] || getDefaultLocalStoragePath();
  //#endregion

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
  public readonly COOKIE_SAME_SITE: 'lax' | 'strict' | 'none' = (() => {
    const value = process.env['COOKIE_SAME_SITE']?.toLowerCase();
    return value === 'lax' || value === 'strict' || value === 'none'
      ? value
      : 'lax';
  })();
  /**
   * Cookie domain
   * @default undefined
   */
  public readonly COOKIE_DOMAIN: string | undefined =
    process.env['COOKIE_DOMAIN'];

  /**
   * Contact email included in VAPID details.
   */
  public readonly VAPID_EMAIL: string =
    process.env['VAPID_EMAIL'] || 'konvoez@invalid.email';

  /**
   * Directory for persisting VAPID keys on disk.
   * Default is the shared app data directory next to sqlite and files.
   */
  public readonly VAPID_FILE_DIR: string =
    process.env['VAPID_FILE_DIR'] || getDefaultDataDir();

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
  /**
   * Lowest WebRTC UDP/TCP port for Mediasoup
   * @default 40000
   */
  public readonly MEDIASOUP_MIN_PORT: number =
    Number(process.env['MEDIASOUP_MIN_PORT']) || 40000;
  /**
   * Highest WebRTC UDP/TCP port for Mediasoup
   * @default 40100
   */
  public readonly MEDIASOUP_MAX_PORT: number =
    Number(process.env['MEDIASOUP_MAX_PORT']) || 40100;
  //#endregion

  /**
   * Optional GitHub token for authenticated Releases API calls
   * (higher rate limit than unauthenticated 60 req/h).
   * Classic PAT needs no scopes for public repos.
   */
  public readonly GITHUB_TOKEN: string | undefined =
    process.env['GITHUB_TOKEN'] || undefined;

  //#region SMTP
  /**
   * SMTP host. Empty disables outbound email.
   */
  public readonly SMTP_HOST: string | undefined =
    process.env['SMTP_HOST']?.trim() || undefined;

  /**
   * SMTP encryption mode.
   * - TLS: implicit TLS (default port 465)
   * - STARTTLS: explicit TLS upgrade (default port 587)
   * - anything else / empty: no encryption (default port 25)
   */
  public readonly SMTP_ENCRYPTION: SmtpEncryption = this.parseSmtpEncryption(
    process.env['SMTP_ENCRYPTION'],
  );

  /**
   * SMTP port. Defaults depend on SMTP_ENCRYPTION.
   */
  public readonly SMTP_PORT: number =
    Number(process.env['SMTP_PORT']) ||
    this.defaultSmtpPort(this.SMTP_ENCRYPTION);

  public readonly SMTP_USER: string | undefined =
    process.env['SMTP_USER']?.trim() || undefined;

  public readonly SMTP_PASS: string | undefined =
    process.env['SMTP_PASS'] || undefined;

  /**
   * From address. Falls back to SMTP_USER or konvoez@localhost.
   */
  public readonly SMTP_FROM: string =
    process.env['SMTP_FROM']?.trim() ||
    process.env['SMTP_USER']?.trim() ||
    'konvoez@localhost';

  /**
   * Whether to reject unauthorized TLS certificates.
   * @default true
   */
  public readonly SMTP_TLS_REJECT_UNAUTHORIZED: boolean =
    process.env['SMTP_TLS_REJECT_UNAUTHORIZED']?.toLowerCase() !== 'false';
  //#endregion

  private parseSmtpEncryption(raw: string | undefined): SmtpEncryption {
    const value = (raw ?? '').trim().toUpperCase();
    if (value === 'TLS' || value === 'STARTTLS') {
      return value;
    }
    return null;
  }

  private defaultSmtpPort(encryption: SmtpEncryption): number {
    if (encryption === 'TLS') return 465;
    if (encryption === 'STARTTLS') return 587;
    return 25;
  }
}
