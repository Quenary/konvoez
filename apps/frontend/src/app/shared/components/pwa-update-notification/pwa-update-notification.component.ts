import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
} from '@angular/core';
import { PwaUpdateService } from '@core/services/pwa-update.service';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiNotification } from '@taiga-ui/core';

import { icons } from '@constants';

@Component({
  selector: 'app-pwa-update-notification',
  imports: [TuiNotification, TuiButton, TranslatePipe],
  templateUrl: './pwa-update-notification.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaUpdateNotificationComponent {
  private readonly pwaUpdateService = inject(PwaUpdateService);

  protected readonly icons = icons;
  protected readonly show = linkedSignal(() =>
    this.pwaUpdateService.updatePostponed(),
  );

  protected readonly labelKey = computed(() => {
    const type = this.pwaUpdateService.postponedUpdateType();
    return type === 'unrecoverable'
      ? 'PWA.UNRECOVERABLE.TITLE'
      : 'PWA.UPDATE.TITLE';
  });

  protected readonly actionKey = computed(() => {
    const type = this.pwaUpdateService.postponedUpdateType();
    return type === 'unrecoverable'
      ? 'PWA.UNRECOVERABLE.ACTION'
      : 'PWA.UPDATE.ACTION';
  });

  protected update(): void {
    this.pwaUpdateService.applyAvailableUpdate();
  }
}
