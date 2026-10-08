import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { TuiButton, TuiDialogContext } from '@taiga-ui/core';
import { TuiForm } from '@taiga-ui/layout';
import { SettingsDevicesComponent } from '../settings-devices/settings-devices.component';
import { SettingsNotificationsComponent } from '../settings-notifications/settings-notifications.component';
import { SettingsStore } from '@core/stores/settings.store';

@Component({
  selector: 'app-initial-setup-dialog',
  imports: [
    TranslatePipe,
    TuiButton,
    TuiForm,
    SettingsNotificationsComponent,
    SettingsDevicesComponent,
  ],
  templateUrl: './initial-setup-dialog.component.html',
  styleUrl: './initial-setup-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InitialSetupDialogComponent {
  public readonly context = injectContext<TuiDialogContext<boolean, void>>();
  private readonly settingsStore = inject(SettingsStore);

  protected confirm(): void {
    this.settingsStore.persistLocalSettings();
    this.context.completeWith(true);
  }
}
