import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { parse } from 'yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  ApiErrorCode,
  type ApiErrorResponse,
  type WsAckError,
} from '@konvoez/shared';
import {
  ApiErrorService,
  isApiErrorCode,
  parseApiError,
} from './api-error.service';

function getI18nDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'apps/frontend/public/i18n'),
    path.resolve(__dirname, '../../../../../../public/i18n'),
    path.resolve(__dirname, '../../../../../public/i18n'),
    path.resolve(__dirname, '../../../../public/i18n'),
  ];
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) {
    throw new Error(
      `i18n directory not found in candidates: ${candidates.join(', ')}`,
    );
  }
  return found;
}

describe('isApiErrorCode', () => {
  it.each(Object.values(ApiErrorCode))(
    'returns true for valid code %s',
    (code) => {
      expect(isApiErrorCode(code)).toBe(true);
    },
  );

  it.each([
    ['not a code', 'SOMETHING_ELSE'],
    ['empty string', ''],
    ['UNKNOWN', 'UNKNOWN'],
    ['number', 404],
    ['boolean', true],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
  ])('returns false for non-error-code input: %s', (_, value) => {
    expect(isApiErrorCode(value)).toBe(false);
  });
});

describe('parseApiError', () => {
  it('returns null for falsy values', () => {
    expect(parseApiError(null)).toBeNull();
    expect(parseApiError(undefined)).toBeNull();
    expect(parseApiError('')).toBeNull();
    expect(parseApiError(0)).toBeNull();
  });

  it('parses bare ApiErrorCode string', () => {
    const result = parseApiError(ApiErrorCode.AUTH_INVALID_CREDENTIALS);
    expect(result).toEqual({
      code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      message: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
    });
  });

  it('parses Error with ApiErrorCode as message', () => {
    const result = parseApiError(new Error(ApiErrorCode.ROOM_NOT_FOUND));
    expect(result).toEqual({
      code: ApiErrorCode.ROOM_NOT_FOUND,
      message: ApiErrorCode.ROOM_NOT_FOUND,
    });
  });

  it('parses Error with JSON-encoded ApiErrorResponse message', () => {
    const payload: ApiErrorResponse = {
      code: ApiErrorCode.CONFLICT,
      message: 'Conflict details',
      params: { id: 42 },
    };
    const result = parseApiError(new Error(JSON.stringify(payload)));
    expect(result).toEqual(payload);
  });

  it('returns null for generic Error with non-code message', () => {
    expect(parseApiError(new Error('Network disconnected'))).toBeNull();
  });

  it('parses HttpErrorResponse with ApiErrorResponse body', () => {
    const payload: ApiErrorResponse = {
      code: ApiErrorCode.FORBIDDEN,
      message: 'Access denied',
    };
    const response = new HttpErrorResponse({
      status: 403,
      error: payload,
    });
    expect(parseApiError(response)).toEqual(payload);
  });

  it('parses HttpErrorResponse with JSON string error body', () => {
    const payload: ApiErrorResponse = {
      code: ApiErrorCode.USER_NOT_FOUND,
      message: 'User not found',
    };
    const response = new HttpErrorResponse({
      status: 404,
      error: JSON.stringify(payload),
    });
    expect(parseApiError(response)).toEqual(payload);
  });

  it('parses HttpErrorResponse with raw ApiErrorCode string body', () => {
    const response = new HttpErrorResponse({
      status: 401,
      error: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
    });
    expect(parseApiError(response)).toEqual({
      code: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
      message: ApiErrorCode.AUTH_INVALID_CREDENTIALS,
    });
  });

  it('returns null for HttpErrorResponse with non-JSON string or non-matching body', () => {
    const textResponse = new HttpErrorResponse({
      status: 500,
      error: 'Internal Server Error',
    });
    expect(parseApiError(textResponse)).toBeNull();

    const emptyResponse = new HttpErrorResponse({
      status: 500,
      error: null,
    });
    expect(parseApiError(emptyResponse)).toBeNull();
  });

  it('parses WsAckError shape', () => {
    const ack: WsAckError = {
      error: {
        code: ApiErrorCode.VOICE_MEDIA_INVALID,
        message: 'Unsupported codec',
      },
    };
    expect(parseApiError(ack)).toEqual(ack.error);
  });

  it('parses plain ApiErrorResponse object', () => {
    const errorObj: ApiErrorResponse = {
      code: ApiErrorCode.FILE_TOO_BIG,
      message: 'File is too large',
      params: { max: '10MB' },
    };
    expect(parseApiError(errorObj)).toEqual(errorObj);
  });

  it('returns null for unrecognized objects', () => {
    expect(parseApiError({ foo: 'bar' })).toBeNull();
    expect(parseApiError({ code: 'NOT_A_REAL_CODE' })).toBeNull();
  });
});

describe('ApiErrorService', () => {
  let service: ApiErrorService;
  let translations: Record<string, string>;
  let translateServiceMock: {
    instant: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    translations = {
      'ERRORS.UNKNOWN': 'An unexpected error occurred',
      'ERRORS.AUTH_INVALID_CREDENTIALS': 'Invalid login credentials',
      'ERRORS.FILE_TOO_BIG': 'File exceeds max size {{max}}',
      'ERRORS.AUTH_EMAIL_TAKEN': 'Email is already registered',
      'VALIDATION.REQUIRED': 'Field is required',
      'VALIDATION.MIN_LENGTH': 'Value is too short',
      'CUSTOM.STRING_ERROR': 'A custom localized message',
      'CUSTOM.FALLBACK': 'Custom fallback message',
    };

    translateServiceMock = {
      instant: vi.fn((key: string, params?: Record<string, unknown>) => {
        let text = translations[key];
        if (!text) {
          return key;
        }
        if (params) {
          for (const [pKey, pVal] of Object.entries(params)) {
            text = text.replace(`{{${pKey}}}`, String(pVal));
          }
        }
        return text;
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        ApiErrorService,
        { provide: TranslateService, useValue: translateServiceMock },
      ],
    });

    service = TestBed.inject(ApiErrorService);
  });

  describe('parse', () => {
    it('delegates to parseApiError', () => {
      expect(service.parse(ApiErrorCode.UNAUTHORIZED)).toEqual({
        code: ApiErrorCode.UNAUTHORIZED,
        message: ApiErrorCode.UNAUTHORIZED,
      });
      expect(service.parse(null)).toBeNull();
    });
  });

  describe('translate', () => {
    it('translates known error code without params', () => {
      const result = service.translate(ApiErrorCode.AUTH_INVALID_CREDENTIALS);
      expect(result).toBe('Invalid login credentials');
      expect(translateServiceMock.instant).toHaveBeenCalledWith(
        'ERRORS.AUTH_INVALID_CREDENTIALS',
        undefined,
      );
    });

    it('translates known error code with interpolation params', () => {
      const error: ApiErrorResponse = {
        code: ApiErrorCode.FILE_TOO_BIG,
        message: 'File too large',
        params: { max: '10MB' },
      };
      const result = service.translate(error);
      expect(result).toBe('File exceeds max size 10MB');
      expect(translateServiceMock.instant).toHaveBeenCalledWith(
        'ERRORS.FILE_TOO_BIG',
        { max: '10MB' },
      );
    });

    it('falls back to parsed.message when key is not in translations and message is custom', () => {
      const error: ApiErrorResponse = {
        code: ApiErrorCode.CALL_NOT_JOINABLE,
        message: 'Custom call failure explanation',
      };
      // Delete translation for CALL_NOT_JOINABLE so instant returns the key
      delete translations['ERRORS.CALL_NOT_JOINABLE'];

      const result = service.translate(error);
      expect(result).toBe('Custom call failure explanation');
    });

    it('falls back to translated fallbackKey when code has no translation and message equals code', () => {
      delete translations['ERRORS.PAYLOAD_TOO_LARGE'];
      const result = service.translate(ApiErrorCode.PAYLOAD_TOO_LARGE);
      expect(result).toBe('An unexpected error occurred');
    });

    it('translates direct string keys if error is not an ApiErrorCode', () => {
      const result = service.translate('CUSTOM.STRING_ERROR');
      expect(result).toBe('A custom localized message');
    });

    it('uses provided custom fallbackKey when translation is missing', () => {
      const result = service.translate('NON_EXISTENT_KEY', 'CUSTOM.FALLBACK');
      expect(result).toBe('Custom fallback message');
    });

    it('returns raw fallbackKey when fallbackKey translation itself is missing', () => {
      const result = service.translate(
        'NON_EXISTENT_KEY',
        'TOTALLY_MISSING_FALLBACK_KEY',
      );
      expect(result).toBe('TOTALLY_MISSING_FALLBACK_KEY');
    });
  });

  describe('fieldErrors', () => {
    it('returns empty object when error is null or has no fields', () => {
      expect(service.fieldErrors(null)).toEqual({});
      expect(service.fieldErrors('SOMETHING')).toEqual({});
      expect(
        service.fieldErrors({
          code: ApiErrorCode.VALIDATION_FAILED,
          message: 'Failed',
        }),
      ).toEqual({});
      expect(
        service.fieldErrors({
          code: ApiErrorCode.VALIDATION_FAILED,
          message: 'Failed',
          fields: [],
        }),
      ).toEqual({});
    });

    it('translates fields using VALIDATION.<code_or_prefixed>', () => {
      const error: ApiErrorResponse = {
        code: ApiErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        fields: [
          { path: 'username', code: 'REQUIRED' },
          { path: 'password', code: 'VALIDATION.MIN_LENGTH' },
        ],
      };

      const result = service.fieldErrors(error);
      expect(result).toEqual({
        username: 'Field is required',
        password: 'Value is too short',
      });
    });

    it('falls back to ERRORS.<code> when VALIDATION.<code> translation is not found', () => {
      const error: ApiErrorResponse = {
        code: ApiErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        fields: [{ path: 'email', code: 'AUTH_EMAIL_TAKEN' }],
      };

      const result = service.fieldErrors(error);
      expect(result).toEqual({
        email: 'Email is already registered',
      });
    });

    it('falls back to raw code when neither VALIDATION nor ERRORS translation exists', () => {
      const error: ApiErrorResponse = {
        code: ApiErrorCode.VALIDATION_FAILED,
        message: 'Validation failed',
        fields: [{ path: 'bio', code: 'UNKNOWN_CUSTOM_VALIDATOR' }],
      };

      const result = service.fieldErrors(error);
      expect(result).toEqual({
        bio: 'UNKNOWN_CUSTOM_VALIDATOR',
      });
    });
  });
});

describe('i18n Translation Completeness Contract', () => {
  const i18nDir = getI18nDir();
  const enYamlPath = path.join(i18nDir, 'en.yaml');
  const ruYamlPath = path.join(i18nDir, 'ru.yaml');

  interface TranslationFile {
    ERRORS?: Record<string, unknown>;
  }

  const enContent = fs.readFileSync(enYamlPath, 'utf-8');
  const ruContent = fs.readFileSync(ruYamlPath, 'utf-8');

  const enParsed = parse(enContent) as TranslationFile;
  const ruParsed = parse(ruContent) as TranslationFile;

  it('both en.yaml and ru.yaml have an ERRORS section', () => {
    expect(enParsed.ERRORS).toBeDefined();
    expect(typeof enParsed.ERRORS).toBe('object');
    expect(ruParsed.ERRORS).toBeDefined();
    expect(typeof ruParsed.ERRORS).toBe('object');
  });

  it('has non-empty ERRORS.UNKNOWN in en.yaml and ru.yaml', () => {
    const enUnknown = enParsed.ERRORS?.['UNKNOWN'];
    expect(typeof enUnknown).toBe('string');
    expect((enUnknown as string).trim().length).toBeGreaterThan(0);

    const ruUnknown = ruParsed.ERRORS?.['UNKNOWN'];
    expect(typeof ruUnknown).toBe('string');
    expect((ruUnknown as string).trim().length).toBeGreaterThan(0);
  });

  const allCodes = Object.values(ApiErrorCode);

  it.each(allCodes)(
    'en.yaml contains non-empty translation for error code %s',
    (code) => {
      const translation = enParsed.ERRORS?.[code];
      expect(
        typeof translation,
        `Expected en.yaml ERRORS.${code} to be a string`,
      ).toBe('string');
      expect(
        (translation as string).trim().length,
        `Expected en.yaml ERRORS.${code} to not be empty`,
      ).toBeGreaterThan(0);
    },
  );

  it.each(allCodes)(
    'ru.yaml contains non-empty translation for error code %s',
    (code) => {
      const translation = ruParsed.ERRORS?.[code];
      expect(
        typeof translation,
        `Expected ru.yaml ERRORS.${code} to be a string`,
      ).toBe('string');
      expect(
        (translation as string).trim().length,
        `Expected ru.yaml ERRORS.${code} to not be empty`,
      ).toBeGreaterThan(0);
    },
  );
});
