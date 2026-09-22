import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TuiCell, TuiIcon, TuiTitle } from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
  TuiAvatar,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { UnreadCountsStore } from '@features/text-room/unread-counts.store';
import { IUser } from '@konvoez/shared';

@Component({
  selector: 'app-direct-chat-item',
  imports: [
    NgOptimizedImage,
    TuiCell,
    TuiIcon,
    TuiTitle,
    TuiAvatar,
    TuiInitialsPipe,
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
