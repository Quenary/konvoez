import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { parseError } from './parse-error.function';

const SERVER_ERROR_KEYS: Record<string, string> = {
  'Room video producer limit reached': 'CALL.VIDEO_LIMIT_REACHED',
};

function resolveMessageKey(key: string, error?: unknown): string {
  if (error === undefined) {
    return key;
  }
  const raw = parseError(error);
  if (raw === undefined) {
    return key;
  }
  return SERVER_ERROR_KEYS[raw] ?? key;
}

export function notifyError(
  notifications: TuiNotificationService,
  translate: TranslateService,
  key: string,
  error?: unknown,
): void {
  const label = translate.instant(resolveMessageKey(key, error));
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
