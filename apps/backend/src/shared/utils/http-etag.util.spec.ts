import { etagMatches } from './http-etag.util';

describe('etagMatches', () => {
  it('returns false when If-None-Match is missing or empty', () => {
    expect(etagMatches(undefined, '"abc"')).toBe(false);
    expect(etagMatches('', '"abc"')).toBe(false);
  });

  it('matches an identical ETag, comma-separated list, or wildcard', () => {
    expect(etagMatches('"abc"', '"abc"')).toBe(true);
    expect(etagMatches('"other", "abc"', '"abc"')).toBe(true);
    expect(etagMatches('*', '"abc"')).toBe(true);
  });

  it('returns false when no ETag matches', () => {
    expect(etagMatches('"other"', '"abc"')).toBe(false);
    expect(etagMatches('W/"abc"', '"abc"')).toBe(false);
  });
});
