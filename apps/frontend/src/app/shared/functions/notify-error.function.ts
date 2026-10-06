import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { parseError } from './parse-error.function';

export function notifyError(
  notifications: TuiNotificationService,
  translate: TranslateService,
  key: string,
  error?: unknown,
): void {
  const detail = error === undefined ? '' : parseError(error);
  notifications
    .open(detail || translate.instant(key), {
      appearance: 'negative',
      autoClose: 5000,
      closable: true,
    })
    .subscribe();
}
