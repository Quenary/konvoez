import { SecretBoxService } from './secret-box.service';
import { AppService } from './app.service';

describe('SecretBoxService', () => {
  let service: SecretBoxService;
  let fakeAppService: AppService;
  const masterKey = Buffer.alloc(32, 7).toString('base64');
  const purpose = 'test-purpose';

  beforeEach(() => {
    fakeAppService = {
      MASTER_KEY: masterKey,
    } as unknown as AppService;
    service = new SecretBoxService(fakeAppService);
  });

  it('encrypts output starting with v1: and successfully decrypts', () => {
    const plain = 'secret_totp_seed_12345';
    const encrypted = service.encrypt(plain, purpose);

    expect(encrypted.startsWith('v1:')).toBe(true);
    const decrypted = service.decrypt(encrypted, purpose);
    expect(decrypted).toBe(plain);
  });

  it('generates a fresh IV for each call', () => {
    const plain = 'same_secret';
    const enc1 = service.encrypt(plain, purpose);
    const enc2 = service.encrypt(plain, purpose);

    expect(enc1).not.toBe(enc2);
    expect(service.decrypt(enc1, purpose)).toBe(plain);
    expect(service.decrypt(enc2, purpose)).toBe(plain);
  });

  it('throws on tampered ciphertext', () => {
    const plain = 'sensitive_data';
    const encrypted = service.encrypt(plain, purpose);

    // Tamper with payload
    const prefix = 'v1:';
    const payload = encrypted.slice(prefix.length);
    const buf = Buffer.from(payload, 'base64');
    buf[buf.length - 1] ^= 0xff; // flip last byte
    const tampered = `${prefix}${buf.toString('base64')}`;

    expect(() => service.decrypt(tampered, purpose)).toThrow();
  });

  it('throws when decrypted with a different purpose (AAD mismatch)', () => {
    const plain = 'sensitive_data';
    const encrypted = service.encrypt(plain, purpose);

    expect(() => service.decrypt(encrypted, 'different-purpose')).toThrow();
  });

  it('throws on missing or unsupported version prefix', () => {
    const plain = 'data';
    const encrypted = service.encrypt(plain, purpose);
    const rawPayload = encrypted.slice('v1:'.length);

    expect(() => service.decrypt(rawPayload, purpose)).toThrow(
      /missing version prefix/i,
    );
    expect(() => service.decrypt(`v999:${rawPayload}`, purpose)).toThrow(
      /unsupported secret box version/i,
    );
  });

  it('throws on short or malformed payload', () => {
    expect(() =>
      service.decrypt(`v1:${Buffer.from('short').toString('base64')}`, purpose),
    ).toThrow(/too short/i);
  });

  it('throws when MASTER_KEY is not configured', () => {
    const emptyAppService = {
      MASTER_KEY: null,
    } as unknown as AppService;
    const unconfiguredService = new SecretBoxService(emptyAppService);

    expect(() => unconfiguredService.encrypt('data', purpose)).toThrow(
      /MASTER_KEY is not configured/i,
    );
  });
});
