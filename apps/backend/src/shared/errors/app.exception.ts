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

    this.params = params;
    this.fields = effectiveFields;
    this.attachmentIds = effectiveAttachmentIds;
  }
}
