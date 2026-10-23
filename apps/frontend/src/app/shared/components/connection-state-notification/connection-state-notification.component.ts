import {
  ChangeDetectionStrategy,
  Component,
  inject,
  linkedSignal,
} from '@angular/core';
import { ConnectionStateService } from '@core/services/connection-state.service';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiNotification } from '@taiga-ui/core';

import { icons } from '@constants';

@Component({
  selector: 'app-connection-state-notification',
  imports: [TuiNotification, TranslatePipe],
  templateUrl: './connection-state-notification.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionStateNotificationComponent {
  private readonly connectionStateService = inject(ConnectionStateService);

  protected readonly icons = icons;
  protected readonly show = linkedSignal(
    () => !this.connectionStateService.isOnline(),
  );
}
