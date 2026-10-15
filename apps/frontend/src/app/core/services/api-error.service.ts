import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { ApiErrorCode, type ApiErrorResponse } from '@konvoez/shared';

const API_ERROR_CODES = new Set<string>(Object.values(ApiErrorCode));

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODES.has(value);
}

export function parseApiError(error: unknown): ApiErrorResponse | null {
  if (!error) {
    return null;
  }

  if (isApiErrorCode(error)) {
    return { code: error, message: error };
  }

  if (error instanceof Error) {
    if (isApiErrorCode(error.message)) {
      return { code: error.message, message: error.message };
    }
    try {
      const parsed = JSON.parse(error.message) as unknown;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'code' in parsed &&
        isApiErrorCode((parsed as { code: unknown }).code)
      ) {
        return parsed as ApiErrorResponse;
      }
    } catch {
      // ignore non-json error message
    }
  }

  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (typeof body === 'object' && body !== null) {
      if ('code' in body && isApiErrorCode((body as { code: unknown }).code)) {
        return body as ApiErrorResponse;
      }
    }
    if (typeof body === 'string') {
      if (isApiErrorCode(body)) {
        return { code: body, message: body };
      }
      try {
        const parsed = JSON.parse(body) as unknown;
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'code' in parsed &&
          isApiErrorCode((parsed as { code: unknown }).code)
        ) {
          return parsed as ApiErrorResponse;
        }
      } catch {
        // ignore non-json response body
      }
    }
  }

  if (typeof error === 'object') {
    if (
      'error' in error &&
      typeof (error as { error: unknown }).error === 'object' &&
      (error as { error: unknown }).error !== null
    ) {
      const inner = (error as { error: { code?: unknown } }).error;
      if ('code' in inner && isApiErrorCode(inner.code)) {
        return inner as unknown as ApiErrorResponse;
      }
    }

    if ('code' in error && isApiErrorCode((error as { code: unknown }).code)) {
      return error as unknown as ApiErrorResponse;
    }
  }

  return null;
}

@Injectable({ providedIn: 'root' })
export class ApiErrorService {
  private readonly translateService = inject(TranslateService);

  parse(error: unknown): ApiErrorResponse | null {
    return parseApiError(error);
  }

  translate(error: unknown, fallbackKey = 'ERRORS.UNKNOWN'): string {
    const parsed = this.parse(error);
    if (parsed) {
      const key = `ERRORS.${parsed.code}`;
      const translated = this.translateService.instant(key, parsed.params);
      if (translated && translated !== key) {
        return translated;
      }
      if (parsed.message && parsed.message !== parsed.code) {
        return parsed.message;
      }
    }

    if (typeof error === 'string') {
      const direct = this.translateService.instant(error);
      if (direct && direct !== error) {
        return direct;
      }
    }

    const fallback = this.translateService.instant(fallbackKey);
    return fallback && fallback !== fallbackKey ? fallback : fallbackKey;
  }

  fieldErrors(error: unknown): Record<string, string> {
    const parsed = this.parse(error);
    if (!parsed?.fields || parsed.fields.length === 0) {
      return {};
    }

    const result: Record<string, string> = {};
    for (const field of parsed.fields) {
      const validationKey = field.code.startsWith('VALIDATION.')
        ? field.code
        : `VALIDATION.${field.code}`;
      const translatedValidation = this.translateService.instant(validationKey);
      if (translatedValidation && translatedValidation !== validationKey) {
        result[field.path] = translatedValidation;
        continue;
      }

      const errorKey = `ERRORS.${field.code}`;
      const translatedError = this.translateService.instant(errorKey);
      if (translatedError && translatedError !== errorKey) {
        result[field.path] = translatedError;
        continue;
      }

      result[field.path] = field.code;
    }

    return result;
  }
}
