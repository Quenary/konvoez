import crypto from 'crypto';
import { deriveAes256KeyFromMasterKey } from '../utils/master-key.util';
import {
  TWO_FACTOR_RECOVERY_KEY_INFO,
  TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE,
} from './master-key.registry';
import { decryptSecretBox, encryptSecretBox } from './secret-box';

export function hmacSha256Hex(
  masterKey: string,
  purpose: string,
  value: string,
): string {
  const key = deriveAes256KeyFromMasterKey(masterKey, purpose);
  const hex = crypto
    .createHmac('sha256', key)
    .update(value, 'utf8')
    .digest('hex');
  return `v1:${hex}`;
}

export function hashRecoveryCode(key: Buffer, normalizedCode: string): string {
  const hex = crypto
    .createHmac('sha256', key)
    .update(normalizedCode, 'utf8')
    .digest('hex');
  return `v1:${hex}`;
}

export function wrapRecoveryHmacKey(masterKey: string): string {
  const raw = deriveAes256KeyFromMasterKey(
    masterKey,
    TWO_FACTOR_RECOVERY_KEY_INFO,
  );
  return encryptSecretBox(
    masterKey,
    raw.toString('base64'),
    TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE,
  );
}

export function unwrapRecoveryHmacKey(
  masterKey: string,
  wrapped: string,
): Buffer {
  const encoded = decryptSecretBox(
    masterKey,
    wrapped,
    TWO_FACTOR_RECOVERY_KEY_WRAP_PURPOSE,
  );
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) {
    throw new Error('Invalid recovery HMAC key');
  }
  return key;
}
