import { EncryptionService } from './encryption.service';
import { AppService } from './app.service';
import crypto from 'crypto';

describe('EncryptionService', () => {
  const masterKey = crypto.randomBytes(32).toString('base64');
  let fakeAppService: AppService;
  let service: EncryptionService;

  beforeEach(() => {
    fakeAppService = {
      MASTER_KEY: masterKey,
    } as unknown as AppService;
    service = new EncryptionService(fakeAppService);
  });

  describe('constructor', () => {
    it('throws when MASTER_KEY is not set', () => {
      const emptyAppService = {} as AppService;
      expect(() => new EncryptionService(emptyAppService)).toThrow(
        'MASTER_KEY is not set',
      );
    });
  });

  describe('encrypt and decrypt', () => {
    it('successfully encrypts and decrypts a plain text string', () => {
      const message = 'Hello, this is a secret chat message!';
      const { encrypted, iv, authTag } = service.encrypt(message);

      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(iv).toBeInstanceOf(Uint8Array);
      expect(authTag).toBeInstanceOf(Uint8Array);
      expect(iv.length).toBe(12);
      expect(authTag.length).toBe(16);

      const decrypted = service.decrypt(encrypted, iv, authTag);
      expect(decrypted).toBe(message);
    });

    it('successfully handles empty string', () => {
      const message = '';
      const { encrypted, iv, authTag } = service.encrypt(message);
      const decrypted = service.decrypt(encrypted, iv, authTag);
      expect(decrypted).toBe(message);
    });

    it('successfully handles unicode, multiline strings, and emojis', () => {
      const message = 'Привет мир!\nLine 2 with emojis 🚀🔒✨\nこんにちは';
      const { encrypted, iv, authTag } = service.encrypt(message);
      const decrypted = service.decrypt(encrypted, iv, authTag);
      expect(decrypted).toBe(message);
    });

    it('generates different IVs for identical content', () => {
      const message = 'Identical message';
      const res1 = service.encrypt(message);
      const res2 = service.encrypt(message);

      expect(Buffer.from(res1.iv).equals(Buffer.from(res2.iv))).toBe(false);
      expect(
        Buffer.from(res1.encrypted).equals(Buffer.from(res2.encrypted)),
      ).toBe(false);
    });

    it('fails to decrypt if ciphertext is corrupted', () => {
      const message = 'Sensitive data';
      const { encrypted, iv, authTag } = service.encrypt(message);

      const corruptedCiphertext = new Uint8Array(encrypted);
      corruptedCiphertext[0] ^= 0xff;

      expect(() => service.decrypt(corruptedCiphertext, iv, authTag)).toThrow();
    });

    it('fails to decrypt if authTag is corrupted', () => {
      const message = 'Sensitive data';
      const { encrypted, iv, authTag } = service.encrypt(message);

      const corruptedAuthTag = new Uint8Array(authTag);
      corruptedAuthTag[0] ^= 0xff;

      expect(() => service.decrypt(encrypted, iv, corruptedAuthTag)).toThrow();
    });

    it('fails to decrypt if wrong IV is used', () => {
      const message = 'Sensitive data';
      const { encrypted, authTag } = service.encrypt(message);

      const wrongIv = new Uint8Array(crypto.randomBytes(12));

      expect(() => service.decrypt(encrypted, wrongIv, authTag)).toThrow();
    });
  });

  describe('hashSearchToken', () => {
    it('produces deterministic HMAC-SHA256 hex string', () => {
      const token = 'hel';
      const hash1 = service.hashSearchToken(token);
      const hash2 = service.hashSearchToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different hashes for different tokens', () => {
      const hash1 = service.hashSearchToken('abc');
      const hash2 = service.hashSearchToken('xyz');

      expect(hash1).not.toBe(hash2);
    });
  });
});
