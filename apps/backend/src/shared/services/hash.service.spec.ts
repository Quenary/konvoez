import { HashService } from './hash.service';

describe('HashService', () => {
  let service: HashService;

  beforeEach(() => {
    service = new HashService();
  });

  describe('hash', () => {
    it('produces a valid Argon2id hash', async () => {
      const plaintext = 'SuperSecret123!';
      const hash = await service.hash(plaintext);

      expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,p=1,t=3\$/);
    });

    it('generates different hashes for identical plaintext due to random salting', async () => {
      const plaintext = 'SamePassword123!';
      const hash1 = await service.hash(plaintext);
      const hash2 = await service.hash(plaintext);

      expect(hash1).not.toBe(hash2);
    });

    it('successfully hashes short one-time codes', async () => {
      const code = '123456';
      const hash = await service.hash(code);

      expect(hash).toMatch(/^\$argon2id\$/);
      const isValid = await service.verify(code, hash);
      expect(isValid).toBe(true);
    });

    it('successfully hashes complex unicode characters and symbols', async () => {
      const unicodeString = '🔐Пароль!@#$%^&*()_+=~` 日本語';
      const hash = await service.hash(unicodeString);

      const isValid = await service.verify(unicodeString, hash);
      expect(isValid).toBe(true);
    });
  });

  describe('verify', () => {
    it('returns true when plaintext matches the hash', async () => {
      const plaintext = 'CorrectPassword456!';
      const hash = await service.hash(plaintext);

      const result = await service.verify(plaintext, hash);
      expect(result).toBe(true);
    });

    it('returns false when plaintext does not match the hash', async () => {
      const plaintext = 'CorrectPassword456!';
      const wrongPlaintext = 'WrongPassword456!';
      const hash = await service.hash(plaintext);

      const result = await service.verify(wrongPlaintext, hash);
      expect(result).toBe(false);
    });

    it('returns false when hash is corrupted or invalid without throwing', async () => {
      const resultCorrupt = await service.verify(
        'password',
        'not-a-valid-argon2-hash',
      );
      expect(resultCorrupt).toBe(false);

      const resultEmpty = await service.verify('password', '');
      expect(resultEmpty).toBe(false);
    });
  });
});
