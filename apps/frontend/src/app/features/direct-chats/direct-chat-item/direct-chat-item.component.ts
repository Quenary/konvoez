import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiCell, TuiIcon, TuiTitle } from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
  TuiAvatar,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiFade,
} from '@taiga-ui/kit';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { IUser } from '@konvoez/shared';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';

@Component({
  selector: 'app-direct-chat-item',
  imports: [
    TuiCell,
    TuiIcon,
    TuiTitle,
    TuiAvatar,
    TranslatePipe,
    UserAvatarComponent,
    TuiAutoColorPipe,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiFade,
  ],
  templateUrl: './direct-chat-item.component.html',
  styleUrl: './direct-chat-item.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DirectChatItemComponent {
  private readonly ngrxStore = inject(Store);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  readonly user = input.required<IUser>();
  readonly selected = output<IUser>();

  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);
  protected readonly isSelf = computed(() => {
    const current = this.currentUser();
    const user = this.user();
    return current?.id === user.id;
  });
}
