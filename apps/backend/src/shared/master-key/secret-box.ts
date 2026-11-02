import crypto from 'crypto';
import { deriveAes256KeyFromMasterKey } from '../utils/master-key.util';

export const CURRENT_SECRET_BOX_VERSION = 'v1';

const keyDerivers: Record<
  string,
  (masterKey: string, purpose: string) => Buffer
> = {
  v1: (masterKey, purpose) => deriveAes256KeyFromMasterKey(masterKey, purpose),
};

export function encryptSecretBox(
  masterKey: string,
  plain: string,
  purpose: string,
): string {
  const keyDeriver = keyDerivers[CURRENT_SECRET_BOX_VERSION];
  const key = keyDeriver(masterKey, purpose);
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

export function decryptSecretBox(
  masterKey: string,
  token: string,
  purpose: string,
): string {
  const colonIndex = token.indexOf(':');
  if (colonIndex <= 0) {
    throw new Error('Invalid secret box token format: missing version prefix');
  }

  const version = token.slice(0, colonIndex);
  const rawPayload = token.slice(colonIndex + 1);
  const keyDeriver = keyDerivers[version];
  if (!keyDeriver) {
    throw new Error(`Unsupported secret box version: ${version}`);
  }

  const raw = Buffer.from(rawPayload, 'base64');
  if (raw.length < 28) {
    throw new Error('Secret box payload is too short');
  }

  const key = keyDeriver(masterKey, purpose);
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
