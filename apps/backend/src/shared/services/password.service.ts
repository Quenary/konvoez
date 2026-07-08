import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 2 ** 16, // 64 MB
      timeCost: 3,
      parallelism: 1,
    });
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return await argon2.verify(hash, password);
  }
}
