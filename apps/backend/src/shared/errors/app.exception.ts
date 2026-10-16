import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@konvoez/shared';

export interface AppExceptionOptions {
  params?: Record<string, string | number>;
  message?: string;
  fields?: { path: string; code: string }[];
  attachmentIds?: string[];
}

export class AppException extends HttpException {
  readonly params?: Record<string, string | number>;
  readonly fields?: { path: string; code: string }[];
  readonly attachmentIds?: string[];

  constructor(
    readonly code: ApiErrorCode,
    status: HttpStatus,
    options: AppExceptionOptions = {},
  ) {
    const effectiveMessage = options.message ?? code;

    super(
      {
        code,
        message: effectiveMessage,
        ...(options.params ? { params: options.params } : {}),
        ...(options.fields ? { fields: options.fields } : {}),
        ...(options.attachmentIds
          ? { attachmentIds: options.attachmentIds }
          : {}),
      },
      status,
    );

    this.message = effectiveMessage;
    this.params = options.params;
    this.fields = options.fields;
    this.attachmentIds = options.attachmentIds;
  }

  static badRequest(
    code: ApiErrorCode,
    options?: AppExceptionOptions | string,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.BAD_REQUEST,
      normalizeOptions(options),
    );
  }

  static unauthorized(
    code: ApiErrorCode,
    options?: AppExceptionOptions | string,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.UNAUTHORIZED,
      normalizeOptions(options),
    );
  }

  static forbidden(
    code: ApiErrorCode,
    options?: AppExceptionOptions | string,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.FORBIDDEN,
      normalizeOptions(options),
    );
  }

  static notFound(
    code: ApiErrorCode,
    options?: AppExceptionOptions | string,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.NOT_FOUND,
      normalizeOptions(options),
    );
  }

  static conflict(
    code: ApiErrorCode,
    options?: AppExceptionOptions | string,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.CONFLICT,
      normalizeOptions(options),
    );
  }

  static payloadTooLarge(
    code: ApiErrorCode,
    options?: AppExceptionOptions | string,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.PAYLOAD_TOO_LARGE,
      normalizeOptions(options),
    );
  }

  static serviceUnavailable(
    code: ApiErrorCode,
    options?: AppExceptionOptions | string,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.SERVICE_UNAVAILABLE,
      normalizeOptions(options),
    );
  }
}

function normalizeOptions(
  options?: AppExceptionOptions | string,
): AppExceptionOptions {
  if (!options) return {};
  if (typeof options === 'string') return { message: options };
  return options;
}
