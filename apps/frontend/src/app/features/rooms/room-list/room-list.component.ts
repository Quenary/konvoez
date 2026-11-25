import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { TuiDropdown } from '@taiga-ui/core';
import {
  TuiAvatar,
  TuiAvatarStack,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiFade,
} from '@taiga-ui/kit';
import { ERoomType, TVoiceRoomPeerUser } from '@konvoez/shared';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { ListItemComponent } from '@shared/components/list-item/list-item.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { RoomAvatarComponent } from '@shared/components/room-avatar/room-avatar.component';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { RoomContextMenuComponent } from '../room-context-menu/room-context-menu.component';
import { RoomManageService } from '../room-manage.service';
import { IVoiceRoomRow, RoomViewService } from '../room-view.service';
import { formatVoiceStackExtra, voiceRoomStack } from './room-list-stack';

interface IVoiceListRoom extends IVoiceRoomRow {
  shownPeers: TVoiceRoomPeerUser[];
  extraLabel: string | null;
}

@Component({
  selector: 'app-room-list',
  imports: [
    NgTemplateOutlet,
    TranslatePipe,
    CdkDrag,
    CdkDropList,
    TuiAvatar,
    TuiAvatarStack,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiFade,
    TuiDropdown,
    PulseIndicatorComponent,
    RoomAvatarComponent,
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
  private readonly roomManageService = inject(RoomManageService);

  public readonly type = input.required<ERoomType>();

  protected readonly ERoomType = ERoomType;
  protected readonly dragStartDelay = { touch: 300, mouse: 0 };
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

  protected onRoomDropped(event: CdkDragDrop<unknown>, type: ERoomType): void {
    if (event.previousContainer !== event.container) return;
    if (event.previousIndex === event.currentIndex) return;
    this.roomManageService.reorderRooms(
      type,
      event.previousIndex,
      event.currentIndex,
    );
  }
}
