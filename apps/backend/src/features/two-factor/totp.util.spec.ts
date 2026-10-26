import {
  base32Decode,
  base32Encode,
  buildOtpAuthUri,
  generateSecret,
  totpAt,
  verifyTotp,
} from './totp.util';

describe('totp.util', () => {
  // RFC 6238 Appendix B test seed: ASCII "12345678901234567890" (20 bytes)
  const rfcSecretAscii = '12345678901234567890';
  const rfcSecretBase32 = base32Encode(Buffer.from(rfcSecretAscii, 'ascii'));

  describe('RFC 6238 SHA-1 Test Vectors (6 digits)', () => {
    it.each([
      { timeSec: 59, expectedCode: '287082' },
      { timeSec: 1111111109, expectedCode: '081804' },
      { timeSec: 1111111111, expectedCode: '050471' },
      { timeSec: 1234567890, expectedCode: '005924' },
      { timeSec: 2000000000, expectedCode: '279037' },
      { timeSec: 20000000000, expectedCode: '353130' },
    ])('computes $expectedCode at T=$timeSec', ({ timeSec, expectedCode }) => {
      const step = Math.floor(timeSec / 30);
      const code = totpAt(rfcSecretBase32, step, 6);
      expect(code).toBe(expectedCode);
    });
  });

  describe('Base32 encoding and decoding', () => {
    it('round trips arbitrary binary data', () => {
      for (const len of [1, 5, 10, 16, 20, 32]) {
        const original = Buffer.alloc(len);
        for (let i = 0; i < len; i++) original[i] = (i * 37 + 13) % 256;

        const encoded = base32Encode(original);
        const decoded = base32Decode(encoded);
        expect(decoded).toEqual(original);
      }
    });

    it('generates a 32-character secret for 20 bytes', () => {
      const secret = generateSecret(20);
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
      const decoded = base32Decode(secret);
      expect(decoded.length).toBe(20);
    });

    it('throws on invalid Base32 characters', () => {
      expect(() => base32Decode('INVALID89')).toThrow(/invalid base32/i);
    });
  });

  describe('verifyTotp', () => {
    const secret = generateSecret();
    const currentStep = 100000;
    const nowMs = currentStep * 30 * 1000;

    it('accepts valid code at current time', () => {
      const code = totpAt(secret, currentStep);
      const result = verifyTotp(secret, code, nowMs, null, 1);
      expect(result).toBe(currentStep);
    });

    it('accepts code within +-1 step acceptance window', () => {
      const prevCode = totpAt(secret, currentStep - 1);
      const nextCode = totpAt(secret, currentStep + 1);

      expect(verifyTotp(secret, prevCode, nowMs, null, 1)).toBe(
        currentStep - 1,
      );
      expect(verifyTotp(secret, nextCode, nowMs, null, 1)).toBe(
        currentStep + 1,
      );
    });

    it('rejects code outside +-1 step window', () => {
      const tooOldCode = totpAt(secret, currentStep - 2);
      const tooNewCode = totpAt(secret, currentStep + 2);

      expect(verifyTotp(secret, tooOldCode, nowMs, null, 1)).toBeNull();
      expect(verifyTotp(secret, tooNewCode, nowMs, null, 1)).toBeNull();
    });

    it('rejects replayed or older steps (lastStep guard)', () => {
      const currentCode = totpAt(secret, currentStep);
      const prevCode = totpAt(secret, currentStep - 1);

      // If last accepted step is equal to currentStep, currentStep must be rejected
      expect(verifyTotp(secret, currentCode, nowMs, currentStep, 1)).toBeNull();

      // If last accepted step is greater than step, must be rejected
      expect(verifyTotp(secret, prevCode, nowMs, currentStep, 1)).toBeNull();

      // But a newer step (currentStep + 1) should be accepted
      const nextCode = totpAt(secret, currentStep + 1);
      expect(verifyTotp(secret, nextCode, nowMs, currentStep, 1)).toBe(
        currentStep + 1,
      );
    });

    it('rejects malformed or non-6-digit codes', () => {
      expect(verifyTotp(secret, '12345', nowMs)).toBeNull();
      expect(verifyTotp(secret, '1234567', nowMs)).toBeNull();
      expect(verifyTotp(secret, 'abcdef', nowMs)).toBeNull();
      expect(verifyTotp(secret, '', nowMs)).toBeNull();
    });
  });

  describe('buildOtpAuthUri', () => {
    it('constructs well-formed URI with URI encoding', () => {
      const uri = buildOtpAuthUri({
        secret: 'JBSWY3DPEHPK3PXP',
        account: 'alice@example.com',
        issuer: 'Konvoez Team',
      });

      expect(uri).toBe(
        'otpauth://totp/Konvoez%20Team:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Konvoez%20Team&algorithm=SHA1&digits=6&period=30',
      );
    });
  });
});
