import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiDropdown } from '@taiga-ui/core';
import {
  TuiAvatar,
  TuiAvatarStack,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiFade,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { ERoomType, TVoiceRoomPeerUser } from '@konvoez/shared';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { ListItemComponent } from '@shared/components/list-item/list-item.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { RoomContextMenuComponent } from '../room-context-menu/room-context-menu.component';
import { IVoiceRoomRow, RoomViewService } from '../room-view.service';
import { formatVoiceStackExtra, voiceRoomStack } from './room-list-stack';

interface IVoiceListRoom extends IVoiceRoomRow {
  shownPeers: TVoiceRoomPeerUser[];
  extraLabel: string | null;
}

@Component({
  selector: 'app-room-list',
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    TranslatePipe,
    TuiAvatar,
    TuiAvatarStack,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiFade,
    TuiInitialsPipe,
    TuiDropdown,
    PulseIndicatorComponent,
    UserAvatarComponent,
    RoomContextMenuComponent,
    ListItemComponent,
  ],
  providers: [RoomViewService],
  templateUrl: './room-list.component.html',
  styleUrl: './room-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomListComponent {
  protected readonly roomView = inject(RoomViewService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  public readonly type = input.required<ERoomType>();

  protected readonly ERoomType = ERoomType;

  protected readonly voiceRooms = computed<IVoiceListRoom[]>(() => {
    const rooms = this.roomView.voiceRows();
    return rooms.map((room) => {
      const stack = voiceRoomStack(room.peers);
      return {
        ...room,
        shownPeers: stack.shown,
        extraLabel: stack.extra > 0 ? formatVoiceStackExtra(stack.extra) : null,
      };
    });
  });
}
