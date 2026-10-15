import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
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
  TuiDropdown,
  TuiHint,
  TuiNotificationService,
  TuiTitle,
} from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { UserAvatarComponent } from '../components/user-avatar/user-avatar.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { TuiAutoColorPipe } from '@taiga-ui/kit';
import { ChatEditorComponent } from '../components/chat/chat-editor/chat-editor.component';
import { v4 } from 'uuid';
import { VoiceAudioPreferencesStore } from '@core/voice/voice-audio-preferences.store';
import { VolumeControlComponent } from '../components/volume-control/volume-control.component';

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
    TuiDropdown,
    TuiHint,
    ChatEditorComponent,
    TuiTitle,
    VolumeControlComponent,
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
  private readonly voiceAudioPreferencesStore = inject(
    VoiceAudioPreferencesStore,
  );
  private readonly ngrxStore = inject(Store);

  protected readonly user = this.context.data.user;
  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);
  protected readonly isSelf = computed(
    () => this.currentUser()?.id === this.user.id,
  );
  protected readonly chatHintKey = computed(() =>
    this.isSelf() ? 'USER_DIALOG.SAVED_MESSAGES' : 'USER_DIALOG.OPEN_CHAT',
  );
  protected readonly messageTitleKey = computed(() =>
    this.isSelf() ? 'USER_DIALOG.SAVED_MESSAGES' : 'USER_DIALOG.QUICK_MESSAGE',
  );
  protected readonly sending = signal(false);
  protected readonly volume = computed(() =>
    Math.round(
      (this.voiceAudioPreferencesStore.peerGainLevels()[this.user.id] ?? 1) *
        100,
    ),
  );
  protected readonly volumeIcon = computed(() => {
    const volume = this.volume();
    if (volume === 0) {
      return '@tui.volume-off';
    }
    if (volume < 50) {
      return '@tui.volume-1';
    }
    return '@tui.volume-2';
  });

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

  protected onProfileClick(): void {
    void this.router.navigate(['/settings/profile']);
    this.context.completeWith();
  }

  protected onDevicesClick(): void {
    void this.router.navigate(['/settings/devices']);
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

  protected onVolumeChange(value: number): void {
    this.voiceAudioPreferencesStore.setPeerGain(this.user.id, value / 100);
  }
}
