import crypto from 'crypto';
import {
  CHAT_ENCRYPTION_KEY_INFO,
  VAPID_KEY_STORAGE_INFO,
  deriveAes256KeyFromMasterKey,
} from './master-key.util';

describe('deriveAes256KeyFromMasterKey', () => {
  const masterKey = Buffer.alloc(32, 7).toString('base64');

  it('should match the historical chat-encryption HKDF derivation', () => {
    const expected = Buffer.from(
      crypto.hkdfSync(
        'sha256',
        Buffer.from(masterKey, 'base64'),
        Buffer.alloc(16, 0),
        Buffer.from('chat-encryption-key'),
        32,
      ),
    );

    expect(
      deriveAes256KeyFromMasterKey(masterKey, CHAT_ENCRYPTION_KEY_INFO),
    ).toEqual(expected);
  });

  it('should derive a different key for vapid storage than for chat encryption', () => {
    const chatKey = deriveAes256KeyFromMasterKey(
      masterKey,
      CHAT_ENCRYPTION_KEY_INFO,
    );
    const vapidKey = deriveAes256KeyFromMasterKey(
      masterKey,
      VAPID_KEY_STORAGE_INFO,
    );

    expect(chatKey.equals(vapidKey)).toBe(false);
  });

  it('should return a 32-byte key', () => {
    expect(
      deriveAes256KeyFromMasterKey(masterKey, CHAT_ENCRYPTION_KEY_INFO),
    ).toHaveLength(32);
  });
});
