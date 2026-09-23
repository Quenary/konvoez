import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TuiButton, TuiNotificationService, TuiTitle } from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PushNotificationService } from '@core/services/push-notification.service';

@Component({
  selector: 'app-settings-notifications',
  imports: [
    TranslatePipe,
    TuiButton,
    TuiCardLarge,
    TuiForm,
    TuiHeader,
    TuiTitle,
  ],
  templateUrl: './settings-notifications.component.html',
  styleUrl: './settings-notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsNotificationsComponent {
  private readonly pushNotificationService = inject(PushNotificationService);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isSupported = signal(
    this.pushNotificationService.isSupported(),
  );
  protected readonly isLoading = signal(false);
  protected readonly isEnabled = this.pushNotificationService.isEnabled;

  protected onToggle(): void {
    if (!this.isSupported()) {
      this.showError('SETTINGS.NOTIFICATIONS.UNSUPPORTED');
      return;
    }

    this.isLoading.set(true);

    const disabling = this.isEnabled();
    const action$ = disabling
      ? this.pushNotificationService.disable()
      : this.pushNotificationService.enable();

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      this.isLoading.set(false);

      switch (result) {
        case 'enabled':
        case 'disabled':
          break;
        case 'permission-denied':
          this.showError('SETTINGS.NOTIFICATIONS.PERMISSION_DENIED');
          break;
        case 'unsupported':
          this.showError('SETTINGS.NOTIFICATIONS.UNSUPPORTED');
          break;
        case 'failed':
          this.showError(
            disabling
              ? 'SETTINGS.NOTIFICATIONS.DISABLE_ERROR'
              : 'SETTINGS.NOTIFICATIONS.ENABLE_ERROR',
          );
          break;
      }
    });
  }

  private showError(key: string): void {
    this.tuiNotificationsService
      .open(this.translateService.instant(key), {
        appearance: 'negative',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();
  }
}
