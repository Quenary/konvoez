import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TuiButton, TuiTitle } from '@taiga-ui/core';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TranslatePipe } from '@ngx-translate/core';
import { PushNotificationService } from '@core/services/push-notification.service';
import { TuiButtonLoading } from '@taiga-ui/kit';

@Component({
  selector: 'app-settings-notifications',
  imports: [
    TranslatePipe,
    TuiButton,
    TuiCardLarge,
    TuiForm,
    TuiHeader,
    TuiTitle,
    TuiButtonLoading,
  ],
  templateUrl: './settings-notifications.component.html',
  styleUrl: './settings-notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsNotificationsComponent {
  private readonly pushNotificationService = inject(PushNotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly isSupported = signal(
    this.pushNotificationService.isSupported(),
  );
  protected readonly isLoading = signal(false);
  protected readonly isEnabled = this.pushNotificationService.isEnabled;

  protected onToggle(): void {
    if (!this.isSupported()) {
      this.pushNotificationService.notifyToggleError('unsupported', 'enable');
      return;
    }

    this.isLoading.set(true);

    const disabling = this.isEnabled();
    const action = disabling ? 'disable' : 'enable';
    const action$ = disabling
      ? this.pushNotificationService.disable()
      : this.pushNotificationService.enable();

    action$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((result) => {
      this.isLoading.set(false);
      this.pushNotificationService.notifyToggleError(result, action);
    });
  }
}
