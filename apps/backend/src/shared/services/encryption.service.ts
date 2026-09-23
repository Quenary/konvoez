import { Injectable } from '@nestjs/common';
import { AppService } from './app.service';
import * as crypto from 'crypto';
import {
  CHAT_ENCRYPTION_KEY_INFO,
  deriveAes256KeyFromMasterKey,
} from '../utils/master-key.util';

@Injectable()
export class EncryptionService {
  private readonly algorithm: crypto.CipherGCMTypes = 'aes-256-gcm';

  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();

  private readonly key: Buffer;

  constructor(private readonly appService: AppService) {
    if (!this.appService.MASTER_KEY) {
      throw new Error('MASTER_KEY is not set');
    }

    this.key = deriveAes256KeyFromMasterKey(
      this.appService.MASTER_KEY,
      CHAT_ENCRYPTION_KEY_INFO,
    );
  }

  /**
   * Encrypt
   */
  encrypt(content: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(this.encoder.encode(content)),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: new Uint8Array(encrypted),
      iv: new Uint8Array(iv),
      authTag: new Uint8Array(authTag),
    };
  }

  /**
   * Decrypt
   */
  decrypt(encrypted: Uint8Array, iv: Uint8Array, authTag: Uint8Array) {
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);
    return this.decoder.decode(decrypted);
  }

  /**
   * Hash search token (trigram)
   */
  hashSearchToken(token: string): string {
    return crypto.createHmac('sha256', this.key).update(token).digest('hex');
  }
}
