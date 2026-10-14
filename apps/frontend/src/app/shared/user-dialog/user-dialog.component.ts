import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import { IUser } from '@konvoez/shared';
import { TuiButton, TuiDialogContext, TuiHint } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { UserAvatarComponent } from '../components/user-avatar/user-avatar.component';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiAutoColorPipe } from '@taiga-ui/kit';

export interface IUserDialogData {
  readonly user: IUser;
}

@Component({
  selector: 'app-user-dialog',
  templateUrl: './user-dialog.component.html',
  styleUrl: './user-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    UserAvatarComponent,
    TranslatePipe,
    TuiAutoColorPipe,
    TuiButton,
    TuiHint,
  ],
})
export class UserDialogComponent {
  private readonly context =
    injectContext<TuiDialogContext<void, IUserDialogData>>();
  private readonly directCallService = inject(DirectCallService);
  private readonly router = inject(Router);

  protected readonly user = this.context.data.user;

  protected onCallClick(): void {
    void this.directCallService.initiateCall(this.context.data.user);
  }

  protected onChatClick(): void {
    void this.router.navigate(['/direct', this.context.data.user.id]);
    this.context.completeWith();
  }
}
