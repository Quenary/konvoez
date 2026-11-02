import crypto from 'crypto';

export const VAPID_KEY_STORAGE_INFO = 'vapid-key-storage';

/**
 * Derives a 32-byte AES-256 key from MASTER_KEY using HKDF-SHA256.
 * `info` isolates a key per purpose.
 */
export function deriveAes256KeyFromMasterKey(
  masterKey: string,
  info: string,
): Buffer {
  const rawKey = Buffer.from(masterKey, 'base64');

  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      rawKey,
      Buffer.alloc(16, 0),
      Buffer.from(info),
      32,
    ),
  );
}
