import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorResponse } from '@konvoez/shared';
import { ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import {
  NotFoundError,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { AppException } from './app.exception';

export interface ResolvedApiError {
  status: number;
  body: ApiErrorResponse;
  logLevel: 'warn' | 'error';
}

export function toApiErrorResponse(exception: unknown): ResolvedApiError {
  if (exception instanceof AppException) {
    const res = exception.getResponse() as Record<string, unknown>;
    const body: ApiErrorResponse = {
      code: exception.code,
      message:
        (typeof res.message === 'string' ? res.message : undefined) ??
        exception.code,
      ...(exception.params ? { params: exception.params } : {}),
      ...(exception.fields ? { fields: exception.fields } : {}),
      ...(exception.attachmentIds
        ? { attachmentIds: exception.attachmentIds }
        : {}),
    };
    return {
      status: exception.getStatus(),
      body,
      logLevel: exception.getStatus() >= 500 ? 'error' : 'warn',
    };
  }

  if (exception instanceof ZodValidationException) {
    const rawError = exception.getZodError();
    const zodError =
      rawError instanceof ZodError
        ? rawError
        : (rawError as unknown as ZodError | undefined);
    const fields =
      zodError?.issues?.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.message,
      })) ?? [];
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        code: ApiErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        fields,
      },
      logLevel: 'warn',
    };
  }

  if (exception instanceof MulterError) {
    if (exception.code === 'LIMIT_FILE_SIZE') {
      const isAvatar = exception.field === 'avatar';
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        body: {
          code: isAvatar
            ? ApiErrorCode.AVATAR_TOO_BIG
            : ApiErrorCode.FILE_TOO_BIG,
          message: isAvatar ? 'Avatar file is too large' : 'File is too large',
        },
        logLevel: 'warn',
      };
    }
    return {
      status: HttpStatus.BAD_REQUEST,
      body: {
        code: ApiErrorCode.UPLOAD_MALFORMED,
        message: exception.message,
      },
      logLevel: 'warn',
    };
  }

  if (exception instanceof UniqueConstraintViolationException) {
    return {
      status: HttpStatus.CONFLICT,
      body: {
        code: ApiErrorCode.CONFLICT,
        message: 'Resource conflict',
      },
      logLevel: 'warn',
    };
  }

  if (exception instanceof NotFoundError) {
    return {
      status: HttpStatus.NOT_FOUND,
      body: {
        code: ApiErrorCode.NOT_FOUND,
        message: exception.message,
      },
      logLevel: 'warn',
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const rawResponse = exception.getResponse();
    let message = exception.message;
    let codeOverride: ApiErrorCode | undefined;
    let paramsOverride: Record<string, string | number> | undefined;
    let fieldsOverride: { path: string; code: string }[] | undefined;
    let attachmentIdsOverride: string[] | undefined;

    if (typeof rawResponse === 'string') {
      message = rawResponse;
    } else if (typeof rawResponse === 'object' && rawResponse !== null) {
      const resObj = rawResponse as Record<string, unknown>;
      if (typeof resObj.message === 'string') {
        message = resObj.message;
      } else if (Array.isArray(resObj.message)) {
        message = resObj.message.join(', ');
      }
      if (typeof resObj.code === 'string' && resObj.code in ApiErrorCode) {
        codeOverride = resObj.code as ApiErrorCode;
      }
      if (resObj.params && typeof resObj.params === 'object') {
        paramsOverride = resObj.params as Record<string, string | number>;
      }
      if (Array.isArray(resObj.fields)) {
        fieldsOverride = resObj.fields as { path: string; code: string }[];
      }
      if (Array.isArray(resObj.attachmentIds)) {
        attachmentIdsOverride = resObj.attachmentIds as string[];
      }
    }

    let defaultCode: ApiErrorCode;
    switch (status) {
      case 400:
        defaultCode = ApiErrorCode.BAD_REQUEST;
        break;
      case 401:
        defaultCode = ApiErrorCode.UNAUTHORIZED;
        break;
      case 403:
        defaultCode = ApiErrorCode.FORBIDDEN;
        break;
      case 404:
        defaultCode = ApiErrorCode.NOT_FOUND;
        break;
      case 409:
        defaultCode = ApiErrorCode.CONFLICT;
        break;
      case 413:
        defaultCode = ApiErrorCode.PAYLOAD_TOO_LARGE;
        break;
      case 429:
        defaultCode = ApiErrorCode.RATE_LIMITED;
        break;
      case 503:
        defaultCode = ApiErrorCode.SERVICE_UNAVAILABLE;
        break;
      default:
        defaultCode = ApiErrorCode.INTERNAL;
        break;
    }

    return {
      status,
      body: {
        code: codeOverride ?? defaultCode,
        message,
        ...(paramsOverride ? { params: paramsOverride } : {}),
        ...(fieldsOverride ? { fields: fieldsOverride } : {}),
        ...(attachmentIdsOverride
          ? { attachmentIds: attachmentIdsOverride }
          : {}),
      },
      logLevel: status >= 500 ? 'error' : 'warn',
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: {
      code: ApiErrorCode.INTERNAL,
      message: 'Internal server error',
    },
    logLevel: 'error',
  };
}
