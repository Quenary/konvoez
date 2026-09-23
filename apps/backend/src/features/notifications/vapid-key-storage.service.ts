import { Injectable } from '@nestjs/common';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AppService } from '../../shared/services/app.service';
import {
  deriveAes256KeyFromMasterKey,
  VAPID_KEY_STORAGE_INFO,
} from '../../shared/utils/master-key.util';

export type VapidKeyPair = {
  publicKey: string;
  privateKey: string;
};

@Injectable()
export class VapidKeyStorageService {
  constructor(private readonly appService: AppService) {}

  getVapidFilePath(): string {
    const dir = this.appService.VAPID_FILE_DIR;
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, 'vapid.json');
  }

  readVapidKeysFromDisk(): VapidKeyPair | null {
    try {
      const filePath = this.getVapidFilePath();
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const raw = fs.readFileSync(filePath, 'utf8').trim();
      if (!raw) {
        return null;
      }

      return this.parseStoredVapidValue(raw);
    } catch {
      return null;
    }
  }

  saveVapidKeysToDisk(keys: VapidKeyPair): void {
    const filePath = this.getVapidFilePath();
    const payload = JSON.stringify(keys);
    const serialized = this.appService.MASTER_KEY
      ? this.encryptVapidValue(payload)
      : payload;

    fs.writeFileSync(filePath, serialized, 'utf8');
  }

  private parseStoredVapidValue(rawValue: string): VapidKeyPair | null {
    try {
      const parsedJson = JSON.parse(rawValue) as {
        publicKey?: string;
        privateKey?: string;
      };

      if (
        parsedJson &&
        typeof parsedJson.publicKey === 'string' &&
        typeof parsedJson.privateKey === 'string'
      ) {
        return {
          publicKey: parsedJson.publicKey,
          privateKey: parsedJson.privateKey,
        };
      }
    } catch {
      // Fallback: file may be encrypted with MASTER_KEY.
    }

    return this.decryptVapidValue(rawValue);
  }

  private encryptVapidValue(value: string): string {
    const masterKey = this.appService.MASTER_KEY;
    if (!masterKey) {
      return value;
    }

    const key = deriveAes256KeyFromMasterKey(masterKey, VAPID_KEY_STORAGE_INFO);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(Buffer.from(value, 'utf8')),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }

  private decryptVapidValue(value: string): VapidKeyPair | null {
    const masterKey = this.appService.MASTER_KEY;
    if (!masterKey) {
      return null;
    }

    try {
      const raw = Buffer.from(value, 'base64');
      if (raw.length <= 28) {
        return null;
      }

      const key = deriveAes256KeyFromMasterKey(
        masterKey,
        VAPID_KEY_STORAGE_INFO,
      );
      const iv = raw.subarray(0, 12);
      const authTag = raw.subarray(12, 28);
      const encrypted = raw.subarray(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);

      const decoded = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf8');

      const parsed = JSON.parse(decoded) as {
        publicKey?: string;
        privateKey?: string;
      };

      if (
        parsed &&
        typeof parsed.publicKey === 'string' &&
        typeof parsed.privateKey === 'string'
      ) {
        return {
          publicKey: parsed.publicKey,
          privateKey: parsed.privateKey,
        };
      }
    } catch {
      return null;
    }

    return null;
  }
}
