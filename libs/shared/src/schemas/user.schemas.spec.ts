import { describe, expect, it } from 'vitest';
import { userFullSchema, userSafeSchema } from './user.schemas';

const baseUser = {
  id: 1,
  username: 'alice',
  fullname: 'Alice',
  isOwner: false,
  roles: [],
  permissions: [],
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: null,
  avatar: null,
  avatarUrl: null,
  deletedAt: null,
};

describe('userSafeSchema', () => {
  it('accepts a public user without email', () => {
    const parsed = userSafeSchema.parse(baseUser);
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('twoFactorEnabled');
    expect(parsed.username).toBe('alice');
  });

  it('strips email, twoFactorEnabled, emailVerified, pendingEmail, language, lastDetectedLocale, and lastLoginAt from public user payloads while preserving lastSeenAt', () => {
    const lastSeenAt = new Date('2026-01-02T03:04:05.000Z');
    const parsed = userSafeSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
      twoFactorEnabled: true,
      emailVerified: true,
      pendingEmail: 'pending@example.com',
      language: 'ru',
      lastDetectedLocale: 'ru-RU',
      lastSeenAt,
      lastLoginAt: new Date('2026-01-02T03:00:00.000Z'),
    });
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('twoFactorEnabled');
    expect(parsed).not.toHaveProperty('emailVerified');
    expect(parsed).not.toHaveProperty('pendingEmail');
    expect(parsed).not.toHaveProperty('language');
    expect(parsed).not.toHaveProperty('lastDetectedLocale');
    expect(parsed).not.toHaveProperty('lastLoginAt');
    expect(parsed.lastSeenAt).toEqual(lastSeenAt);
  });
});

describe('userFullSchema', () => {
  it('requires email for self and admin payloads and defaults twoFactorEnabled and emailVerified to false', () => {
    expect(() => userFullSchema.parse(baseUser)).toThrow();
    const parsed = userFullSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
    });
    expect(parsed.email).toBe('alice@example.com');
    expect(parsed.twoFactorEnabled).toBe(false);
    expect(parsed.emailVerified).toBe(false);
    expect(parsed.pendingEmail).toBeUndefined();
  });

  it('preserves twoFactorEnabled, emailVerified, pendingEmail, language, lastDetectedLocale, lastSeenAt, and lastLoginAt', () => {
    const lastSeenAt = new Date('2026-01-02T03:04:05.000Z');
    const lastLoginAt = new Date('2026-01-02T03:00:00.000Z');
    const parsed = userFullSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
      twoFactorEnabled: true,
      emailVerified: true,
      pendingEmail: 'new@example.com',
      language: 'ru',
      lastDetectedLocale: 'ru-RU',
      lastSeenAt,
      lastLoginAt,
    });
    expect(parsed.twoFactorEnabled).toBe(true);
    expect(parsed.emailVerified).toBe(true);
    expect(parsed.pendingEmail).toBe('new@example.com');
    expect(parsed.language).toBe('ru');
    expect(parsed.lastDetectedLocale).toBe('ru-RU');
    expect(parsed.lastSeenAt).toEqual(lastSeenAt);
    expect(parsed.lastLoginAt).toEqual(lastLoginAt);
  });

  it('defaults lastDetectedLocale to en and language to undefined', () => {
    const parsed = userFullSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
    });
    expect(parsed.lastDetectedLocale).toBe('en');
    expect(parsed.language).toBeUndefined();
  });
});
