import { describe, expect, it } from 'vitest';
import {
  ApiErrorCode,
  apiErrorResponseSchema,
  GENERIC_API_ERROR_CODES,
  isGenericApiErrorCode,
  wsAckErrorSchema,
} from './errors';

describe('ApiErrorCode', () => {
  it('has every enum value equal to its key', () => {
    for (const [key, value] of Object.entries(ApiErrorCode)) {
      expect(value).toBe(key);
    }
  });

  it('contains all 68 expected error codes', () => {
    expect(Object.keys(ApiErrorCode).length).toBe(68);
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

describe('apiErrorResponseSchema & wsAckErrorSchema', () => {
  it('validates a structured api error response', () => {
    const parsed = apiErrorResponseSchema.safeParse({
      code: ApiErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      fields: [{ path: 'username', code: 'TOO_SHORT' }],
      params: { min: 3 },
      attachmentIds: ['att-1'],
    });
    expect(parsed.success).toBe(true);
  });

  it('validates wsAckErrorSchema', () => {
    const parsed = wsAckErrorSchema.safeParse({
      error: {
        code: ApiErrorCode.NOT_FOUND,
        message: 'Room not found',
      },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects invalid error code', () => {
    const parsed = apiErrorResponseSchema.safeParse({
      code: 'UNKNOWN_CODE',
      message: 'Error',
    });
    expect(parsed.success).toBe(false);
  });
});
