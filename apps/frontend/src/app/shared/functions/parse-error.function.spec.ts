import { HttpErrorResponse } from '@angular/common/http';
import { describe, expect, it, vi } from 'vitest';
import { ApiErrorCode, ApiErrorResponse } from '@konvoez/shared';
import { parseError } from './parse-error.function';

describe('parseError', () => {
  describe('HttpErrorResponse', () => {
    it('formats status and api error message', () => {
      const response = new HttpErrorResponse({
        status: 400,
        error: {
          code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
          message: 'Invalid email or password',
        },
      });

      expect(parseError(response)).toBe('400<br>Invalid email or password');
    });

    it('falls back to code when api error message is empty', () => {
      const response = new HttpErrorResponse({
        status: 403,
        error: {
          code: ApiErrorCode.FORBIDDEN,
          message: '',
        },
      });

      expect(parseError(response)).toBe(`403<br>${ApiErrorCode.FORBIDDEN}`);
    });

    it('formats fields list when present in api error', () => {
      const response = new HttpErrorResponse({
        status: 422,
        error: {
          code: ApiErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          fields: [
            { path: 'email', code: 'VALIDATION_INVALID_EMAIL' },
            { path: 'password', code: 'VALIDATION_TOO_SHORT' },
          ],
        },
      });

      expect(parseError(response)).toBe(
        '422<br>Validation failed<br><ul><li>email: VALIDATION_INVALID_EMAIL</li><li>password: VALIDATION_TOO_SHORT</li></ul>',
      );
    });

    it('formats legacy error message and details when api error is absent', () => {
      const response = new HttpErrorResponse({
        status: 500,
        error: {
          message: 'Internal server error',
          details: ['Detail A', 'Detail B'],
        },
      });

      expect(parseError(response)).toBe(
        '500<br>Internal server error<br><ul><li>Detail A</li><li>Detail B</li></ul>',
      );
    });

    it('formats status only when error body has no message or details', () => {
      const response = new HttpErrorResponse({
        status: 404,
        error: null,
      });

      expect(parseError(response)).toBe('404');
    });
  });

  describe('direct ApiErrorResponse object', () => {
    it('formats api error message', () => {
      const apiError: ApiErrorResponse = {
        code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
        message: 'Invalid credentials',
      };

      expect(parseError(apiError)).toBe('Invalid credentials');
    });

    it('falls back to code and includes fields list', () => {
      const apiError: ApiErrorResponse = {
        code: ApiErrorCode.VALIDATION_FAILED,
        message: '',
        fields: [{ path: 'username', code: 'REQUIRED' }],
      };

      expect(parseError(apiError)).toBe(
        `${ApiErrorCode.VALIDATION_FAILED}<br><ul><li>username: REQUIRED</li></ul>`,
      );
    });
  });

  describe('generic and primitive error types', () => {
    it('extracts message from Error instance', () => {
      expect(parseError(new Error('Network disconnected'))).toBe(
        'Network disconnected',
      );
    });

    it('returns string as-is', () => {
      expect(parseError('Simple error description')).toBe(
        'Simple error description',
      );
    });

    it('serializes plain object to JSON', () => {
      expect(parseError({ status: 'failed', code: 123 })).toBe(
        '{"status":"failed","code":123}',
      );
    });

    it('handles JSON circular reference gracefully and logs error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        /* noop */
      });
      const circular: Record<string, unknown> = {};
      circular['self'] = circular;

      expect(parseError(circular)).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('returns undefined for falsy values', () => {
      expect(parseError(null)).toBeUndefined();
      expect(parseError(undefined)).toBeUndefined();
    });
  });
});
