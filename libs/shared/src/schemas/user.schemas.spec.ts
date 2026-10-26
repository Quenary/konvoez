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

  it('strips email and twoFactorEnabled from public user payloads', () => {
    const parsed = userSafeSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
      twoFactorEnabled: true,
    });
    expect(parsed).not.toHaveProperty('email');
    expect(parsed).not.toHaveProperty('twoFactorEnabled');
  });
});

describe('userFullSchema', () => {
  it('requires email for self and admin payloads and defaults twoFactorEnabled to false', () => {
    expect(() => userFullSchema.parse(baseUser)).toThrow();
    const parsed = userFullSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
    });
    expect(parsed.email).toBe('alice@example.com');
    expect(parsed.twoFactorEnabled).toBe(false);
  });

  it('preserves twoFactorEnabled when true', () => {
    const parsed = userFullSchema.parse({
      ...baseUser,
      email: 'alice@example.com',
      twoFactorEnabled: true,
    });
    expect(parsed.twoFactorEnabled).toBe(true);
  });
});
