import crypto from 'crypto';
import {
  VAPID_KEY_STORAGE_INFO,
  deriveAes256KeyFromMasterKey,
} from './master-key.util';

describe('deriveAes256KeyFromMasterKey', () => {
  const masterKey = Buffer.alloc(32, 7).toString('base64');
  const info = 'purpose-a';

  it('should match HKDF-SHA256 with a zero salt', () => {
    const expected = Buffer.from(
      crypto.hkdfSync(
        'sha256',
        Buffer.from(masterKey, 'base64'),
        Buffer.alloc(16, 0),
        Buffer.from(info),
        32,
      ),
    );

    expect(deriveAes256KeyFromMasterKey(masterKey, info)).toEqual(expected);
  });

  it('should derive a different key for a different info value', () => {
    const first = deriveAes256KeyFromMasterKey(masterKey, info);
    const second = deriveAes256KeyFromMasterKey(
      masterKey,
      VAPID_KEY_STORAGE_INFO,
    );

    expect(first.equals(second)).toBe(false);
  });

  it('should return a 32-byte key', () => {
    expect(deriveAes256KeyFromMasterKey(masterKey, info)).toHaveLength(32);
  });
});
