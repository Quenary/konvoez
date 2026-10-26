import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import { AppService } from './app.service';
import { deriveAes256KeyFromMasterKey } from '../utils/master-key.util';

export const CURRENT_SECRET_BOX_VERSION = 'v1';

@Injectable()
export class SecretBoxService {
  private readonly keyDerivers: Record<string, (purpose: string) => Buffer> = {
    v1: (purpose: string) => {
      const masterKey = this.appService.MASTER_KEY;
      if (!masterKey) {
        throw new Error('MASTER_KEY is not configured');
      }
      return deriveAes256KeyFromMasterKey(masterKey, purpose);
    },
  };

  constructor(private readonly appService: AppService) {}

  encrypt(plain: string, purpose: string): string {
    const keyDeriver = this.keyDerivers[CURRENT_SECRET_BOX_VERSION];
    const key = keyDeriver(purpose);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(purpose, 'utf8'));

    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(plain, 'utf8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const payload = Buffer.concat([iv, authTag, encrypted]).toString('base64');
    return `${CURRENT_SECRET_BOX_VERSION}:${payload}`;
  }

  decrypt(token: string, purpose: string): string {
    const colonIndex = token.indexOf(':');
    if (colonIndex <= 0) {
      throw new Error(
        'Invalid secret box token format: missing version prefix',
      );
    }

    const version = token.slice(0, colonIndex);
    const rawPayload = token.slice(colonIndex + 1);

    const keyDeriver = this.keyDerivers[version];
    if (!keyDeriver) {
      throw new Error(`Unsupported secret box version: ${version}`);
    }

    const raw = Buffer.from(rawPayload, 'base64');
    if (raw.length < 28) {
      throw new Error('Secret box payload is too short');
    }

    const key = keyDeriver(purpose);
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(purpose, 'utf8'));

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  }
}
