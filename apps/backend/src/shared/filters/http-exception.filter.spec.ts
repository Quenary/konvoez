jest.mock('@mikro-orm/core', () => ({
  UniqueConstraintViolationException: class UniqueConstraintViolationException extends Error {},
  NotFoundError: class NotFoundError extends Error {},
}));

import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiErrorCode } from '@konvoez/shared';
import { ZodValidationException } from 'nestjs-zod';
import { z } from 'zod';
import { MulterError } from 'multer';
import {
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { HttpExceptionFilter } from './http-exception.filter';
import { AppException } from '../errors/app.exception';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;
  let responseMock: { status: jest.Mock; json: jest.Mock };
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    responseMock = { status: statusMock, json: jsonMock };

    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  const createHost = (type = 'http'): ArgumentsHost =>
    ({
      getType: () => type,
      switchToHttp: () => ({
        getResponse: () => responseMock,
        getRequest: () => ({}),
      }),
    }) as unknown as ArgumentsHost;

  it('rethrows exception if context is not http', () => {
    const host = createHost('ws');
    const err = new Error('ws error');
    expect(() => filter.catch(err, host)).toThrow(err);
  });

  it('handles AppException preserving status, code, params, and fields', () => {
    const host = createHost();
    const appEx = new AppException(
      ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      HttpStatus.UNAUTHORIZED,
      { attempt: 1 },
      'Bad credentials',
      [{ path: 'password', code: 'INVALID' }],
    );

    filter.catch(appEx, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    expect(jsonMock).toHaveBeenCalledWith({
      code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'Bad credentials',
      params: { attempt: 1 },
      fields: [{ path: 'password', code: 'INVALID' }],
    });
    expect(warnSpy).toHaveBeenCalled();
  });

  it('handles ZodValidationException converting to VALIDATION_FAILED with fields', () => {
    const host = createHost();
    const schema = z.object({
      email: z.string().email('EMAIL_INVALID'),
      age: z.number().min(18, 'TOO_YOUNG'),
    });
    const parsed = schema.safeParse({ email: 'bad-email', age: 10 });
    if (parsed.success) throw new Error('Expected failure');

    const zodEx = new ZodValidationException(parsed.error);
    filter.catch(zodEx, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith({
      code: ApiErrorCode.VALIDATION_FAILED,
      message: 'Validation failed',
      fields: [
        { path: 'email', code: 'EMAIL_INVALID' },
        { path: 'age', code: 'TOO_YOUNG' },
      ],
    });
  });

  it('handles MulterError LIMIT_FILE_SIZE for avatar field as AVATAR_TOO_BIG', () => {
    const host = createHost();
    const multerError = new MulterError('LIMIT_FILE_SIZE', 'avatar');

    filter.catch(multerError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(jsonMock).toHaveBeenCalledWith({
      code: ApiErrorCode.AVATAR_TOO_BIG,
      message: 'Avatar file is too large',
    });
  });

  it('handles MulterError LIMIT_FILE_SIZE for generic file as FILE_TOO_BIG', () => {
    const host = createHost();
    const multerError = new MulterError('LIMIT_FILE_SIZE', 'file');

    filter.catch(multerError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(jsonMock).toHaveBeenCalledWith({
      code: ApiErrorCode.FILE_TOO_BIG,
      message: 'File is too large',
    });
  });

  it('handles other MulterError as UPLOAD_MALFORMED', () => {
    const host = createHost();
    const multerError = new MulterError('LIMIT_UNEXPECTED_FILE', 'extra');

    filter.catch(multerError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(jsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        code: ApiErrorCode.UPLOAD_MALFORMED,
      }),
    );
  });

  it('handles MikroORM UniqueConstraintViolationException as CONFLICT', () => {
    const host = createHost();
    const uniqueEx = new UniqueConstraintViolationException(
      new Error('UNIQUE constraint failed'),
    );

    filter.catch(uniqueEx, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(jsonMock).toHaveBeenCalledWith({
      code: ApiErrorCode.CONFLICT,
      message: 'Resource conflict',
    });
  });

  it('handles MikroORM NotFoundError as NOT_FOUND', () => {
    const host = createHost();
    const notFoundError = new NotFoundError('Entity not found');

    filter.catch(notFoundError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonMock).toHaveBeenCalledWith({
      code: ApiErrorCode.NOT_FOUND,
      message: 'Entity not found',
    });
  });

  it.each([
    [new BadRequestException('Invalid input'), 400, ApiErrorCode.BAD_REQUEST],
    [new UnauthorizedException('No token'), 401, ApiErrorCode.UNAUTHORIZED],
    [new ForbiddenException('Denied'), 403, ApiErrorCode.FORBIDDEN],
    [new NotFoundException('Missing'), 404, ApiErrorCode.NOT_FOUND],
    [new PayloadTooLargeException('Big'), 413, ApiErrorCode.PAYLOAD_TOO_LARGE],
    [
      new ServiceUnavailableException('Offline'),
      503,
      ApiErrorCode.SERVICE_UNAVAILABLE,
    ],
  ])(
    'maps generic HttpException (%s) to status %i and code %s',
    (exception, expectedStatus, expectedCode) => {
      const host = createHost();
      filter.catch(exception, host);

      expect(statusMock).toHaveBeenCalledWith(expectedStatus);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: expectedCode,
        }),
      );
    },
  );

  it('handles generic unhandled Error as 500 INTERNAL without leaking details', () => {
    const host = createHost();
    const plainError = new Error('Sensitive database credentials leak');

    filter.catch(plainError, host);

    expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonMock).toHaveBeenCalledWith({
      code: ApiErrorCode.INTERNAL,
      message: 'Internal server error',
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});
