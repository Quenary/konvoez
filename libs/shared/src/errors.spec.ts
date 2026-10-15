import { describe, expect, it } from 'vitest';
import { ApiErrorCode } from './errors';

describe('ApiErrorCode', () => {
  it('has every enum value equal to its key', () => {
    for (const [key, value] of Object.entries(ApiErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it('contains all 63 expected error codes', () => {
    expect(Object.keys(ApiErrorCode).length).toBe(63);
  });
});
