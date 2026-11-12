import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiGroup, TuiHint } from '@taiga-ui/core';
import { IUserSafe } from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
import { takeInitialQueryParam } from '@shared/functions/take-initial-query-param.function';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { DirectStore } from './direct.store';

import { icons } from '@constants';

@Component({
  selector: 'app-direct',
  imports: [
    ChatComponent,
    VoiceRoomShellComponent,
    PulseIndicatorComponent,
    TuiButton,
    TuiHint,
    TranslatePipe,
    TuiGroup,
  ],
  providers: [DirectStore],
  templateUrl: './direct.component.html',
  styleUrl: './direct.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectComponent {
  private readonly ngrxStore = inject(Store);
  private readonly userDialogService = inject(UserDialogService);
  protected readonly directStore = inject(DirectStore);

  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);

  protected readonly icons = icons;
  protected readonly recipientId = this.directStore.recipientId;
  protected readonly user = this.directStore.user;
  protected readonly isSelf = this.directStore.isSelf;
  protected readonly isCurrentDirectCallActive =
    this.directStore.isCurrentDirectCallActive;
  protected readonly preferChat = this.directStore.preferChat;
  protected readonly title = this.directStore.title;
  protected readonly initialsSource = this.directStore.initialsSource;
  protected readonly avatarUrl = this.directStore.avatarUrl;
  protected readonly avatarIcon = this.directStore.avatarIcon;
  protected readonly isOnline = this.directStore.isOnline;
  protected readonly canRejoinCall = this.directStore.canRejoinCall;
  protected readonly view = this.directStore.view;

  protected readonly targetMessageId = takeInitialQueryParam('message');
  /**
   * Survives the query param being stripped before the chat is created,
   * including while a direct call hides the chat.
   */
  protected readonly heldMessageId = signal<string | null>(null);

  constructor() {
    effect(() => {
      const messageId = this.targetMessageId();
      if (!messageId) {
        return;
      }
      untracked(() => {
        this.directStore.showChat();
        this.heldMessageId.set(messageId);
      });
    });
  }

  protected openDetails(): void {
    const peer = this.user() ?? (this.isSelf() ? this.currentUser() : null);
    void this.userDialogService.open(peer, {
      withFiles: true,
      withInput: false,
    });
  }

  protected showChat(): void {
    this.directStore.showChat();
  }

  protected releaseMessageJump(): void {
    this.heldMessageId.set(null);
  }

  protected showCall(): void {
    this.directStore.showCall();
  }

  protected startDirectCall(recipient: IUserSafe): void {
    this.directStore.startDirectCall(recipient);
  }

  protected rejoinDirectCall(recipient: IUserSafe): void {
    this.directStore.rejoinDirectCall(recipient);
  }

  protected hangup(): void {
    this.directStore.hangup();
  }
}
