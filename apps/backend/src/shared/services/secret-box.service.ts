import { Injectable } from '@nestjs/common';
import { decryptSecretBox, encryptSecretBox } from '../master-key/secret-box';
import { AppService } from './app.service';

@Injectable()
export class SecretBoxService {
  constructor(private readonly appService: AppService) {}

  encrypt(plain: string, purpose: string): string {
    return encryptSecretBox(this.requireMasterKey(), plain, purpose);
  }

  decrypt(token: string, purpose: string): string {
    return decryptSecretBox(this.requireMasterKey(), token, purpose);
  }

  private requireMasterKey(): string {
    const masterKey = this.appService.MASTER_KEY;
    if (!masterKey) {
      throw new Error('MASTER_KEY is not configured');
    }
    return masterKey;
  }
}
