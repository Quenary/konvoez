import { describe, expect, it } from 'vitest';
import { buildInviteUrl } from './invite';

describe('buildInviteUrl', () => {
  it.each([
    {
      baseUrl: 'https://konvoez.example.com',
      code: 'abc',
      email: 'user@example.com',
      expected:
        'https://konvoez.example.com/auth/register?code=abc&email=user%40example.com',
    },
    {
      baseUrl: 'https://konvoez.example.com/some/path',
      code: 'abc',
      email: null,
      expected: 'https://konvoez.example.com/auth/register?code=abc',
    },
    { baseUrl: 'not a url', code: 'abc', email: null, expected: null },
  ])('builds "$expected"', ({ baseUrl, code, email, expected }) => {
    expect(buildInviteUrl(baseUrl, code, email)).toBe(expected);
  });
});
