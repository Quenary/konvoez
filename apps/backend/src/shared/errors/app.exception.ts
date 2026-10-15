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
    optionsOrParams?: Record<string, string | number> | AppExceptionOptions,
    message?: string,
    fields?: { path: string; code: string }[],
    attachmentIds?: string[],
  ) {
    let params: Record<string, string | number> | undefined;
    let effectiveMessage = message ?? code;
    let effectiveFields = fields;
    let effectiveAttachmentIds = attachmentIds;

    if (
      optionsOrParams &&
      ('params' in optionsOrParams ||
        'fields' in optionsOrParams ||
        'attachmentIds' in optionsOrParams ||
        'message' in optionsOrParams)
    ) {
      const opts = optionsOrParams as AppExceptionOptions;
      params = opts.params;
      if (opts.message) effectiveMessage = opts.message;
      if (opts.fields) effectiveFields = opts.fields;
      if (opts.attachmentIds) effectiveAttachmentIds = opts.attachmentIds;
    } else {
      params = optionsOrParams as Record<string, string | number> | undefined;
    }

    super(
      {
        code,
        message: effectiveMessage,
        ...(params ? { params } : {}),
        ...(effectiveFields ? { fields: effectiveFields } : {}),
        ...(effectiveAttachmentIds
          ? { attachmentIds: effectiveAttachmentIds }
          : {}),
      },
      status,
    );

    this.message = effectiveMessage;
    this.params = params;
    this.fields = effectiveFields;
    this.attachmentIds = effectiveAttachmentIds;
  }

  static badRequest(
    code: ApiErrorCode,
    message?: string,
    optsOrParams?: Record<string, string | number> | AppExceptionOptions,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.BAD_REQUEST,
      normalizeHelperOpts(message, optsOrParams),
    );
  }

  static unauthorized(
    code: ApiErrorCode,
    message?: string,
    optsOrParams?: Record<string, string | number> | AppExceptionOptions,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.UNAUTHORIZED,
      normalizeHelperOpts(message, optsOrParams),
    );
  }

  static forbidden(
    code: ApiErrorCode,
    message?: string,
    optsOrParams?: Record<string, string | number> | AppExceptionOptions,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.FORBIDDEN,
      normalizeHelperOpts(message, optsOrParams),
    );
  }

  static notFound(
    code: ApiErrorCode,
    message?: string,
    optsOrParams?: Record<string, string | number> | AppExceptionOptions,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.NOT_FOUND,
      normalizeHelperOpts(message, optsOrParams),
    );
  }

  static conflict(
    code: ApiErrorCode,
    message?: string,
    optsOrParams?: Record<string, string | number> | AppExceptionOptions,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.CONFLICT,
      normalizeHelperOpts(message, optsOrParams),
    );
  }

  static payloadTooLarge(
    code: ApiErrorCode,
    message?: string,
    optsOrParams?: Record<string, string | number> | AppExceptionOptions,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.PAYLOAD_TOO_LARGE,
      normalizeHelperOpts(message, optsOrParams),
    );
  }

  static serviceUnavailable(
    code: ApiErrorCode,
    message?: string,
    optsOrParams?: Record<string, string | number> | AppExceptionOptions,
  ): AppException {
    return new AppException(
      code,
      HttpStatus.SERVICE_UNAVAILABLE,
      normalizeHelperOpts(message, optsOrParams),
    );
  }
}

function normalizeHelperOpts(
  message?: string,
  optsOrParams?: Record<string, string | number> | AppExceptionOptions,
): AppExceptionOptions {
  if (!optsOrParams) return { message };
  if (
    'params' in optsOrParams ||
    'fields' in optsOrParams ||
    'attachmentIds' in optsOrParams ||
    'message' in optsOrParams
  ) {
    const opts = optsOrParams as AppExceptionOptions;
    return { ...opts, message: message ?? opts.message };
  }
  return { params: optsOrParams as Record<string, string | number>, message };
}
