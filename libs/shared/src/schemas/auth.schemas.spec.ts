import { describe, expect, it } from 'vitest';
import {
  authLoginResponseSchema,
  authLoginTwoFactorSchema,
  twoFactorCodeSchema,
  twoFactorEnableSchema,
  twoFactorRequiredSchema,
} from './auth.schemas';

describe('twoFactorCodeSchema', () => {
  it.each([
    '123456',
    '000000',
    '999999',
    'ABCDE-12345',
    'abcde-12345',
    'ABCDE12345',
    '0123456789',
    'JKMNP-QRSTV',
    '  123456  ',
  ])('accepts valid code %s', (code) => {
    expect(() => twoFactorCodeSchema.parse(code)).not.toThrow();
  });

  it.each([
    '12345',
    '1234567',
    '12345a',
    'ABCDEF-12345',
    'ABCD-12345',
    'ABCDI-12345', // I is excluded from Crockford Base32
    'ABCDL-12345', // L is excluded
    'ABCDO-12345', // O is excluded
    'ABCDU-12345', // U is excluded
    '',
    '   ',
  ])('rejects invalid code %s', (code) => {
    expect(() => twoFactorCodeSchema.parse(code)).toThrow();
  });
});

describe('twoFactorEnableSchema', () => {
  it('accepts 6-digit TOTP code', () => {
    expect(twoFactorEnableSchema.parse({ code: '654321' })).toEqual({
      code: '654321',
    });
  });

  it('rejects recovery code for enable step', () => {
    expect(() =>
      twoFactorEnableSchema.parse({ code: 'ABCDE-12345' }),
    ).toThrow();
  });
});

describe('twoFactorRequiredSchema', () => {
  it('parses twoFactorRequired boolean', () => {
    const parsed = twoFactorRequiredSchema.parse({ twoFactorRequired: true });
    expect(parsed.twoFactorRequired).toBe(true);
  });
});

describe('authLoginTwoFactorSchema', () => {
  it('parses valid code', () => {
    const parsed = authLoginTwoFactorSchema.parse({ code: '123456' });
    expect(parsed.code).toBe('123456');
  });
});

describe('authLoginResponseSchema', () => {
  it('parses twoFactorRequired payload', () => {
    const parsed = authLoginResponseSchema.parse({
      twoFactorRequired: true,
    });
    expect(parsed).toEqual({ twoFactorRequired: true });
  });

  it('parses full user payload', () => {
    const fullUser = {
      id: 1,
      username: 'alice',
      fullname: 'Alice',
      email: 'alice@example.com',
      isOwner: false,
      roles: [],
      permissions: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: null,
      avatar: null,
      avatarUrl: null,
      deletedAt: null,
      twoFactorEnabled: true,
    };
    const parsed = authLoginResponseSchema.parse(fullUser);
    expect(parsed).toMatchObject({
      id: 1,
      username: 'alice',
      twoFactorEnabled: true,
    });
  });
});
