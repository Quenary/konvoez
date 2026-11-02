import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class HashService {
  async hash(value: string): Promise<string> {
    return await argon2.hash(value, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  async verify(value: string, hash: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, value);
    } catch {
      return false;
    }
  }
}
