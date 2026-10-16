import { isGenericApiErrorCode } from '@konvoez/shared';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { parseApiError } from '@core/services/api-error.service';

export function resolveErrorMessageKey(
  fallbackKey: string,
  error?: unknown,
): { key: string; params?: Record<string, string | number> } {
  if (error !== undefined) {
    const apiError = parseApiError(error);
    if (apiError && !isGenericApiErrorCode(apiError.code)) {
      return { key: `ERRORS.${apiError.code}`, params: apiError.params };
    }
  }
  return { key: fallbackKey };
}

export function notifyError(
  notifications: TuiNotificationService,
  translate: TranslateService,
  key: string,
  error?: unknown,
): void {
  const resolved = resolveErrorMessageKey(key, error);
  const label = resolved.params
    ? translate.instant(resolved.key, resolved.params)
    : translate.instant(resolved.key);
  if (error !== undefined) {
    console.error(label, error);
  }
  notifications
    .open(label, {
      appearance: 'negative',
      autoClose: 5000,
      closable: true,
    })
    .subscribe();
}
