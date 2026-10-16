import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@konvoez/shared';
import { AppException } from './app.exception';

describe('AppException', () => {
  it('constructs an instance with basic code and status', () => {
    const ex = new AppException(
      ApiErrorCode.BAD_REQUEST,
      HttpStatus.BAD_REQUEST,
    );

    expect(ex.code).toBe(ApiErrorCode.BAD_REQUEST);
    expect(ex.getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(ex.message).toBe(ApiErrorCode.BAD_REQUEST);
    expect(ex.params).toBeUndefined();
    expect(ex.fields).toBeUndefined();
    expect(ex.attachmentIds).toBeUndefined();
  });

  it('constructs an instance with full AppExceptionOptions', () => {
    const ex = new AppException(
      ApiErrorCode.VALIDATION_FAILED,
      HttpStatus.BAD_REQUEST,
      {
        message: 'Custom validation message',
        params: { limit: 10 },
        fields: [{ path: 'username', code: 'REQUIRED' }],
        attachmentIds: ['att-1'],
      },
    );

    expect(ex.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(ex.message).toBe('Custom validation message');
    expect(ex.params).toEqual({ limit: 10 });
    expect(ex.fields).toEqual([{ path: 'username', code: 'REQUIRED' }]);
    expect(ex.attachmentIds).toEqual(['att-1']);
    expect(ex.getResponse()).toEqual({
      code: ApiErrorCode.VALIDATION_FAILED,
      message: 'Custom validation message',
      params: { limit: 10 },
      fields: [{ path: 'username', code: 'REQUIRED' }],
      attachmentIds: ['att-1'],
    });
  });

  describe('static helpers', () => {
    it.each([
      ['badRequest', HttpStatus.BAD_REQUEST],
      ['unauthorized', HttpStatus.UNAUTHORIZED],
      ['forbidden', HttpStatus.FORBIDDEN],
      ['notFound', HttpStatus.NOT_FOUND],
      ['conflict', HttpStatus.CONFLICT],
      ['payloadTooLarge', HttpStatus.PAYLOAD_TOO_LARGE],
      ['serviceUnavailable', HttpStatus.SERVICE_UNAVAILABLE],
    ] as const)('creates %s with status %i', (helperName, expectedStatus) => {
      const helper = AppException[helperName];
      const ex = helper(ApiErrorCode.INTERNAL, {
        message: 'Test message',
        params: { id: '123' },
      });

      expect(ex.getStatus()).toBe(expectedStatus);
      expect(ex.code).toBe(ApiErrorCode.INTERNAL);
      expect(ex.message).toBe('Test message');
      expect(ex.params).toEqual({ id: '123' });
    });

    it('supports string message shorthand in helpers', () => {
      const ex = AppException.badRequest(
        ApiErrorCode.BAD_REQUEST,
        'String message',
      );

      expect(ex.message).toBe('String message');
      expect(ex.params).toBeUndefined();
    });

    it('supports options object with message, params, and fields', () => {
      const ex = AppException.notFound(ApiErrorCode.USER_NOT_FOUND, {
        message: 'User not found',
        params: { userId: 42 },
        fields: [{ path: 'id', code: 'INVALID' }],
      });

      expect(ex.message).toBe('User not found');
      expect(ex.params).toEqual({ userId: 42 });
      expect(ex.fields).toEqual([{ path: 'id', code: 'INVALID' }]);
    });

    it('defaults message to code when no options are provided', () => {
      const ex = AppException.forbidden(ApiErrorCode.FORBIDDEN);

      expect(ex.message).toBe(ApiErrorCode.FORBIDDEN);
      expect(ex.params).toBeUndefined();
    });
  });
});
