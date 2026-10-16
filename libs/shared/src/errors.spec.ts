import { describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  GENERIC_API_ERROR_CODES,
  isGenericApiErrorCode,
} from './errors';

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

describe('GENERIC_API_ERROR_CODES', () => {
  it('identifies the 10 generic error codes', () => {
    expect(GENERIC_API_ERROR_CODES.size).toBe(10);
    expect(isGenericApiErrorCode(ApiErrorCode.INTERNAL)).toBe(true);
    expect(isGenericApiErrorCode(ApiErrorCode.BAD_REQUEST)).toBe(true);
    expect(isGenericApiErrorCode(ApiErrorCode.NOT_FOUND)).toBe(true);
    expect(isGenericApiErrorCode(ApiErrorCode.AUTH_INVALID_CREDENTIALS)).toBe(
      false,
    );
  });
});
