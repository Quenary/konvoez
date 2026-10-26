import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import {
  TuiButton,
  TuiIcon,
  TuiLabel,
  TuiNotificationService,
  TuiScrollbar,
  TuiTitle,
} from '@taiga-ui/core';
import { TuiButtonLoading, TuiSwitch } from '@taiga-ui/kit';
import { TuiCardLarge, TuiForm, TuiHeader } from '@taiga-ui/layout';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DEFAULT_USER_NOTIFICATION_SETTINGS,
  type TMentionType,
  type TUpdateUserNotificationSettings,
  type TUserNotificationSettings,
} from '@konvoez/shared';
import { PushNotificationService } from '@core/services/push-notification.service';
import { NotificationsApiService } from '@core/services/notifications-api.service';
import { icons } from '@constants';

@Component({
  selector: 'app-settings-notifications',
  imports: [
    FormsModule,
    TranslatePipe,
    TuiButton,
    TuiButtonLoading,
    TuiCardLarge,
    TuiForm,
    TuiHeader,
    TuiIcon,
    TuiLabel,
    TuiScrollbar,
    TuiSwitch,
    TuiTitle,
  ],
  templateUrl: './settings-notifications.component.html',
  styleUrl: './settings-notifications.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsNotificationsComponent {
  private readonly pushNotificationService = inject(PushNotificationService);
  private readonly notificationsApiService = inject(NotificationsApiService);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly icons = icons;
  protected readonly isSupported = signal(
    this.pushNotificationService.isSupported(),
  );
  protected readonly isLoading = signal(false);
  protected readonly isSettingsLoading = signal(true);
  protected readonly settingsLoadFailed = signal(false);
  protected readonly isEnabled = this.pushNotificationService.isEnabled;
  protected readonly serverKeyLoaded =
    this.pushNotificationService.serverKeyLoaded;
  protected readonly serverAvailable =
    this.pushNotificationService.serverAvailable;
  protected readonly settings = signal<TUserNotificationSettings>(
    DEFAULT_USER_NOTIFICATION_SETTINGS,
  );
  protected readonly canToggle = computed(() => {
    const isSupported = this.isSupported();
    const serverAvailable = this.serverAvailable();
    const isEnabled = this.isEnabled();

    return isSupported && (serverAvailable || isEnabled);
  });

  constructor() {
    this.pushNotificationService
      .loadServerKey()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();

    this.loadSettings();
  }

  protected loadSettings(): void {
    this.isSettingsLoading.set(true);
    this.settingsLoadFailed.set(false);

    this.notificationsApiService
      .getSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (settings) => {
          this.settings.set(settings);
          this.isSettingsLoading.set(false);
        },
        error: () => {
          this.isSettingsLoading.set(false);
          this.settingsLoadFailed.set(true);
          this.showError('SETTINGS.NOTIFICATIONS.LOAD_ERROR');
        },
      });
  }

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

  protected onUpdateDirectMessages(enabled: boolean): void {
    this.patchSettings({ directMessages: enabled });
  }

  protected onUpdateDirectCalls(enabled: boolean): void {
    this.patchSettings({ directCalls: enabled });
  }

  protected onUpdateMention(type: TMentionType, enabled: boolean): void {
    this.patchSettings({
      mentions: {
        [type]: enabled,
      },
    });
  }

  private patchSettings(partial: TUpdateUserNotificationSettings): void {
    const prev = this.settings();
    const next: TUserNotificationSettings = {
      directMessages: partial.directMessages ?? prev.directMessages,
      directCalls: partial.directCalls ?? prev.directCalls,
      mentions: {
        username: partial.mentions?.username ?? prev.mentions.username,
        role: partial.mentions?.role ?? prev.mentions.role,
        everyone: partial.mentions?.everyone ?? prev.mentions.everyone,
      },
    };
    this.settings.set(next);

    this.notificationsApiService
      .updateSettings(partial)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          this.settings.set(prev);
          this.showError('SETTINGS.NOTIFICATIONS.UPDATE_ERROR');
        },
      });
  }

  private showError(key: string): void {
    this.tuiNotificationService
      .open(this.translateService.instant(key), {
        appearance: 'negative',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();
  }
}
