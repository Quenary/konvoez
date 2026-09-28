import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DirectCallService } from '@core/services/direct-call.service';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { TuiButton, TuiCell, TuiHint, TuiIcon, TuiTitle } from '@taiga-ui/core';
import { TuiAutoColorPipe, TuiPush } from '@taiga-ui/kit';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-incoming-call-dialog',
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
  templateUrl: './incoming-call-dialog.component.html',
  styleUrl: './incoming-call-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncomingCallDialogComponent {
  private readonly directCallService = inject(DirectCallService);

  protected readonly isIncoming = this.directCallService.isIncoming;
  protected readonly interlocutor = this.directCallService.interlocutor;

  protected accept(): void {
    void this.directCallService.acceptCall();
  }

  protected reject(): void {
    this.directCallService.rejectCall();
  }
}
