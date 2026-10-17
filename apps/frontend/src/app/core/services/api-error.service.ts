import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import {
  ApiErrorCode,
  type TApiErrorResponse,
  isGenericApiErrorCode,
} from '@konvoez/shared';

const API_ERROR_CODES = new Set<string>(Object.values(ApiErrorCode));

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && API_ERROR_CODES.has(value);
}

export function parseApiError(error: unknown): TApiErrorResponse | null {
  if (!error) {
    return null;
  }

  if (isApiErrorCode(error)) {
    return { code: error, message: error };
  }

  if (error instanceof Error) {
    if (
      'apiError' in error &&
      typeof (error as { apiError?: unknown }).apiError === 'object' &&
      (error as { apiError?: unknown }).apiError !== null
    ) {
      const candidate = (error as { apiError: { code?: unknown } }).apiError;
      if ('code' in candidate && isApiErrorCode(candidate.code)) {
        return candidate as unknown as TApiErrorResponse;
      }
    }
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
        return parsed as TApiErrorResponse;
      }
    } catch {
      // ignore non-json error message
    }
  }

  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    if (typeof body === 'object' && body !== null) {
      if ('code' in body && isApiErrorCode((body as { code: unknown }).code)) {
        return body as TApiErrorResponse;
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
          return parsed as TApiErrorResponse;
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
        return inner as unknown as TApiErrorResponse;
      }
    }

    if ('code' in error && isApiErrorCode((error as { code: unknown }).code)) {
      return error as unknown as TApiErrorResponse;
    }
  }

  return null;
}

@Injectable({ providedIn: 'root' })
export class ApiErrorService {
  private readonly translateService = inject(TranslateService);

  parse(error: unknown): TApiErrorResponse | null {
    return parseApiError(error);
  }

  translate(error: unknown, fallbackKey = 'ERRORS.UNKNOWN'): string {
    const parsed = this.parse(error);
    if (parsed) {
      if (
        fallbackKey !== 'ERRORS.UNKNOWN' &&
        isGenericApiErrorCode(parsed.code)
      ) {
        const fallback = this.translateService.instant(fallbackKey);
        return fallback && fallback !== fallbackKey ? fallback : fallbackKey;
      }
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
}
