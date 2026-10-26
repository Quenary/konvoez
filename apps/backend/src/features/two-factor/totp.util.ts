import crypto from 'crypto';

const RFC4648_BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TOTP_STEP_SECONDS = 30;

/**
 * Encodes a buffer to RFC 4648 Base32 string (without padding).
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += RFC4648_BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += RFC4648_BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string to a Buffer.
 */
export function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[=\s]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const idx = RFC4648_BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) {
      throw new Error(`Invalid Base32 character: ${clean[i]}`);
    }

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a random Base32 secret for TOTP (default 20 bytes = 160 bits).
 */
export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

/**
 * Computes TOTP for a given Base32 secret at a specified step counter.
 */
export function totpAt(
  secret: string,
  step: number | bigint,
  digits = 6,
): string {
  const key = base32Decode(secret);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(step));

  const hmac = crypto.createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;

  return codeInt.toString().padStart(digits, '0');
}

/**
 * Verifies a 6-digit TOTP code against a Base32 secret within an acceptance window.
 * Returns the matched step number on success, or null if invalid or replayed.
 */
export function verifyTotp(
  secret: string,
  code: string,
  now = Date.now(),
  lastStep: number | null = null,
  window = 1,
): number | null {
  const normalizedCode = code.trim();
  if (!/^\d{6}$/.test(normalizedCode)) {
    return null;
  }

  const currentStep = Math.floor(now / 1000 / TOTP_STEP_SECONDS);
  const codeBuf = Buffer.from(normalizedCode, 'utf8');

  for (let offset = -window; offset <= window; offset++) {
    const step = currentStep + offset;
    if (lastStep !== null && step <= lastStep) {
      // Replay prevention: do not accept a code from a step that was already used or older
      continue;
    }

    const expected = totpAt(secret, step, 6);
    const expectedBuf = Buffer.from(expected, 'utf8');

    if (
      codeBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(codeBuf, expectedBuf)
    ) {
      return step;
    }
  }

  return null;
}

/**
 * Builds standard otpauth URI for authenticator QR codes.
 */
export function buildOtpAuthUri({
  secret,
  account,
  issuer,
}: {
  secret: string;
  account: string;
  issuer: string;
}): string {
  const encIssuer = encodeURIComponent(issuer);
  const encAccount = encodeURIComponent(account);
  return `otpauth://totp/${encIssuer}:${encAccount}?secret=${secret}&issuer=${encIssuer}&algorithm=SHA1&digits=6&period=${TOTP_STEP_SECONDS}`;
}
