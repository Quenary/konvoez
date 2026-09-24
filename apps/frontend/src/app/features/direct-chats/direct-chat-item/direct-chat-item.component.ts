import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { TuiCell, TuiIcon, TuiTitle } from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
  TuiBadgedContent,
  TuiBadgeNotification,
} from '@taiga-ui/kit';
import { UnreadCountsStore } from '@features/text-room/unread-counts.store';
import { IUser } from '@konvoez/shared';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';

@Component({
  selector: 'app-direct-chat-item',
  imports: [
    TuiCell,
    TuiIcon,
    TuiTitle,
    UserAvatarComponent,
    TuiAutoColorPipe,
    TuiBadgedContent,
    TuiBadgeNotification,
  ],
  templateUrl: './direct-chat-item.component.html',
  styleUrl: './direct-chat-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectChatItemComponent {
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  readonly user = input.required<IUser>();
  readonly selected = output<IUser>();
}
