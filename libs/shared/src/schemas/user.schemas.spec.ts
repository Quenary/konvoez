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

  it('strips email, twoFactorEnabled, emailVerified, and pendingEmail from public user payloads', () => {
    const parsed = userSafeSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
      twoFactorEnabled: true,
      emailVerified: true,
      pendingEmail: 'pending@example.com',
    });
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('twoFactorEnabled');
    expect(parsed).not.toHaveProperty('emailVerified');
    expect(parsed).not.toHaveProperty('pendingEmail');
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

  it('preserves twoFactorEnabled, emailVerified, and pendingEmail', () => {
    const parsed = userFullSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
      twoFactorEnabled: true,
      emailVerified: true,
      pendingEmail: 'new@example.com',
    });
    expect(parsed.twoFactorEnabled).toBe(true);
    expect(parsed.emailVerified).toBe(true);
    expect(parsed.pendingEmail).toBe('new@example.com');
  });
});
