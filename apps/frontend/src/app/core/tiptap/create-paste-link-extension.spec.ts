import { describe, expect, it } from 'vitest';
import { getPastedUrlHref } from './create-paste-link-extension';

describe('getPastedUrlHref', () => {
  it('returns href for a pasted https URL', () => {
    expect(getPastedUrlHref('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('returns href for a domain without protocol', () => {
    expect(getPastedUrlHref('example.com')).toBe('https://example.com');
  });

  it('returns null for plain text', () => {
    expect(getPastedUrlHref('hello world')).toBeNull();
  });

  it('returns null when URL is only part of the pasted text', () => {
    expect(getPastedUrlHref('see https://example.com')).toBeNull();
  });
});
