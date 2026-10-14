import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { DirectCallService } from '@core/services/direct-call.service';
import {
  IOutgoingMessageCallbacks,
  OutgoingMessagesStore,
} from '@core/chat/outgoing/outgoing-messages.store';
import { ILocalFile } from '@core/chat/outgoing/outgoing.types';
import { IUser } from '@konvoez/shared';
import {
  TuiButton,
  TuiDialogContext,
  TuiHint,
  TuiNotificationService,
} from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { UserAvatarComponent } from '../components/user-avatar/user-avatar.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TuiAutoColorPipe } from '@taiga-ui/kit';
import { ChatEditorComponent } from '../components/chat/chat-editor/chat-editor.component';
import { v4 } from 'uuid';

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
    ChatEditorComponent,
  ],
})
export class UserDialogComponent {
  private readonly context =
    injectContext<TuiDialogContext<void, IUserDialogData>>();
  private readonly directCallService = inject(DirectCallService);
  private readonly router = inject(Router);
  private readonly outgoingMessagesStore = inject(OutgoingMessagesStore);
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);

  protected readonly user = this.context.data.user;
  protected readonly sending = signal(false);

  private readonly sendCallbacks: IOutgoingMessageCallbacks = {
    onSuccess: () => {
      this.tuiNotificationsService
        .open(this.translateService.instant('USER_DIALOG.MESSAGE_SENT'), {
          appearance: 'positive',
          autoClose: 5000,
          closable: true,
        })
        .subscribe();
      this.context.completeWith();
    },
    onError: () => {
      this.context.completeWith();
    },
  };

  protected onCallClick(): void {
    void this.directCallService.initiateCall(this.context.data.user);
  }

  protected onChatClick(): void {
    void this.router.navigate(['/direct', this.context.data.user.id]);
    this.context.completeWith();
  }

  protected onMessageSubmitted({
    content,
    files,
  }: {
    content: string;
    files: readonly ILocalFile[];
  }): void {
    if (this.sending()) {
      return;
    }
    const tempId = v4();
    this.sending.set(true);
    this.outgoingMessagesStore.send({
      tempId,
      data: {
        content,
        roomId: null,
        recipientId: this.user.id,
        replyToId: null,
        attachmentIds: [],
      },
      replyTo: null,
      files,
      ...this.sendCallbacks,
    });
  }
}
