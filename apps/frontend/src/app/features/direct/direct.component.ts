import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiGroup, TuiHint } from '@taiga-ui/core';
import { IUserSafe } from '@konvoez/shared';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { VoiceRoomShellComponent } from '@shared/components/voice-room/voice-room-shell/voice-room-shell.component';
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
  protected readonly directStore = inject(DirectStore);

  protected readonly icons = icons;
  protected readonly recipientId = this.directStore.recipientId;
  protected readonly user = this.directStore.user;
  protected readonly isSelf = this.directStore.isSelf;
  protected readonly isCurrentDirectCallActive =
    this.directStore.isCurrentDirectCallActive;
  protected readonly preferChat = this.directStore.preferChat;
  protected readonly title = this.directStore.title;
  protected readonly avatarUrl = this.directStore.avatarUrl;
  protected readonly avatarIcon = this.directStore.avatarIcon;
  protected readonly isOnline = this.directStore.isOnline;
  protected readonly canRejoinCall = this.directStore.canRejoinCall;
  protected readonly view = this.directStore.view;

  protected showChat(): void {
    this.directStore.showChat();
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
