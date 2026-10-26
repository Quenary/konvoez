export const TWO_FACTOR_SECRET_KEY_INFO = 'two-factor-secret';
export const TWO_FACTOR_RECOVERY_KEY_INFO = 'two-factor-recovery';

export const TWO_FACTOR_PENDING_COOKIE = 'two-factor-token';
export const TWO_FACTOR_PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

export const TWO_FACTOR_FAIL_LIMIT = 5;
export const TWO_FACTOR_LOCKOUT_TTL_MS = 15 * 60 * 1000; // 15 minutes

export const RECOVERY_CODES_COUNT = 10;
export const CROCKFORD_BASE32_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const CURRENT_RECOVERY_CODE_VERSION = 'v1';

export function get2faPendingCacheKey(sha256PendingId: string): string {
  return `auth:2fa-pending:${sha256PendingId}`;
}

export function get2faFailsCacheKey(userId: number): string {
  return `auth:2fa-fails:${userId}`;
}

export function get2faLockCacheKey(userId: number): string {
  return `auth:2fa-lock:${userId}`;
}
