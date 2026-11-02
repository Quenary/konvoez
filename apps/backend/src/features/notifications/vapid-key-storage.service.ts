import { Injectable } from '@nestjs/common';
import fs from 'fs';
import path from 'path';
import { AppService } from '../../shared/services/app.service';
import {
  decryptSecretBox,
  encryptSecretBox,
} from '../../shared/master-key/secret-box';
import { VAPID_KEY_STORAGE_INFO } from '../../shared/utils/master-key.util';

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

  assertCanGenerateVapidKeys(): void {
    this.reconcileStagedVapidFile();
    const filePath = this.getVapidFilePath();
    if (fs.existsSync(filePath) && this.readVapidKeysFromDisk() === null) {
      throw new Error('vapid.json exists but cannot be read');
    }
  }

  readVapidKeysFromDisk(): VapidKeyPair | null {
    return this.readVapidKeysAt(this.getVapidFilePath());
  }

  saveVapidKeysToDisk(keys: VapidKeyPair): void {
    this.assertCanGenerateVapidKeys();
    const masterKey = this.appService.MASTER_KEY;
    if (!masterKey) {
      throw new Error('MASTER_KEY is not configured');
    }

    const filePath = this.getVapidFilePath();
    const serialized = encryptSecretBox(
      masterKey,
      JSON.stringify(keys),
      VAPID_KEY_STORAGE_INFO,
    );
    fs.writeFileSync(filePath, serialized, 'utf8');
  }

  private parseStoredVapidValue(rawValue: string): VapidKeyPair | null {
    try {
      const parsedJson = JSON.parse(rawValue) as VapidKeyPair;
      if (this.isKeyPair(parsedJson)) {
        return parsedJson;
      }
    } catch {
      // Encrypted payload.
    }

    const masterKey = this.appService.MASTER_KEY;
    if (!masterKey) {
      return null;
    }

    if (!rawValue.startsWith('v1:')) {
      return null;
    }

    try {
      const decoded = decryptSecretBox(
        masterKey,
        rawValue,
        VAPID_KEY_STORAGE_INFO,
      );
      const parsed = JSON.parse(decoded) as VapidKeyPair;
      return this.isKeyPair(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private reconcileStagedVapidFile(): void {
    const filePath = this.getVapidFilePath();
    const stagedPath = `${filePath}.rotate`;
    if (!fs.existsSync(stagedPath)) {
      return;
    }

    const current = this.readVapidKeysAt(filePath);
    const staged = this.readVapidKeysAt(stagedPath);
    if (staged && !current) {
      fs.renameSync(stagedPath, filePath);
      return;
    }
    if (current) {
      return;
    }

    throw new Error(
      'vapid.json.rotate is present but neither file can be read',
    );
  }

  private readVapidKeysAt(filePath: string): VapidKeyPair | null {
    try {
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

  private isKeyPair(value: VapidKeyPair | null): value is VapidKeyPair {
    return (
      !!value &&
      typeof value.publicKey === 'string' &&
      typeof value.privateKey === 'string'
    );
  }
}
