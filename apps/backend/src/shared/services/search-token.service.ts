import { Injectable } from '@nestjs/common';
import { hmacSha256Hex } from '../master-key/hmac';
import { CHAT_SEARCH_PURPOSE } from '../master-key/master-key.registry';
import { AppService } from './app.service';

@Injectable()
export class SearchTokenService {
  constructor(private readonly appService: AppService) {}

  hash(trigram: string): string {
    const masterKey = this.appService.MASTER_KEY;
    if (!masterKey) {
      throw new Error('MASTER_KEY is not configured');
    }
    return hmacSha256Hex(masterKey, CHAT_SEARCH_PURPOSE, trigram);
  }
}
