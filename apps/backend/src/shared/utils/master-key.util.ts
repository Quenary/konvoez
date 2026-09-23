import crypto from 'crypto';

export const CHAT_ENCRYPTION_KEY_INFO = 'chat-encryption-key';
export const VAPID_KEY_STORAGE_INFO = 'vapid-key-storage';

/**
 * Derives a 32-byte AES-256 key from MASTER_KEY using HKDF-SHA256.
 * Uses the same inputs as historical chat encryption so existing
 * ciphertext stays decryptable. Different `info` values isolate keys
 * per purpose without changing the MASTER_KEY format.
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
