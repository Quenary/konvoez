import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { DirectCallService } from '@core/services/direct-call.service';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { TuiButton, TuiCell, TuiHint, TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiPush } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';

import { icons } from '@constants';

@Component({
  selector: 'app-pending-call-dialog',
  imports: [
    UserAvatarComponent,
    PulseIndicatorComponent,
    TuiAutoColorPipe,
    TuiButton,
    TuiCell,
    TuiHint,
    TuiIcon,
    TuiPush,
    TuiTitle,
    TranslatePipe,
  ],
  templateUrl: './pending-call-dialog.component.html',
  styleUrl: './pending-call-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PendingCallDialogComponent {
  private readonly directCallService = inject(DirectCallService);

  protected readonly icons = icons;
  protected readonly isRinging = this.directCallService.isRinging;
  protected readonly interlocutor = this.directCallService.interlocutor;
  protected readonly isInGroupRoom = this.directCallService.isInGroupRoom;

  protected readonly direction = computed(() =>
    this.directCallService.activeCall()?.isCaller ? 'outgoing' : 'incoming',
  );

  protected readonly pendingTitleKey = computed(() =>
    this.direction() === 'outgoing'
      ? 'CALL.PENDING.OUTGOING'
      : 'CALL.PENDING.INCOMING',
  );

  protected accept(): void {
    void this.directCallService.acceptCall();
  }

  protected reject(): void {
    this.directCallService.rejectCall();
  }

  protected cancel(): void {
    this.directCallService.cancelCall();
  }
}
