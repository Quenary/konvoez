import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { Store } from '@ngrx/store';
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
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { ERoomType, IRoom, TVoiceRoomPeerUser } from '@konvoez/shared';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { ListItemComponent } from '@shared/components/list-item/list-item.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { RoomContextMenuComponent } from '../room-context-menu/room-context-menu.component';
import { RoomManageService } from '../room-manage.service';
import { RoomNavigationService } from '../room-navigation.service';
import { createLongtapClickGuard } from '../room-longtap';
import {
  buildVoiceRoomRows,
  formatVoiceStackExtra,
  IVoiceRoomRow,
  voiceRoomStack,
} from '../voice-room-rows';

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
  templateUrl: './room-list.component.html',
  styleUrl: './room-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomListComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly roomsStore = inject(RoomsStore);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly roomManageService = inject(RoomManageService);
  private readonly roomNavigationService = inject(RoomNavigationService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);
  private readonly isTouch = inject(WA_IS_TOUCH);
  private readonly destroyRef = inject(DestroyRef);
  private readonly roomClickGuard = createLongtapClickGuard(() =>
    this.isTouch(),
  );

  public readonly type = input.required<ERoomType>();

  protected readonly ERoomType = ERoomType;
  protected readonly textRooms = this.roomsStore.textRooms;
  protected readonly canManageRooms = this.roomManageService.canManageRooms;
  protected readonly contextMenuOpenedFor = signal<IRoom | null>(null);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly voiceRoomSource = this.roomsStore.voiceRooms;

  protected readonly roomMentionFlags = computed<Record<number, boolean>>(
    () => {
      const mentions = this.unreadCountsStore.roomMentions();
      const flags: Record<number, boolean> = {};
      for (const [roomId, count] of Object.entries(mentions)) {
        if (count > 0) {
          flags[Number(roomId)] = true;
        }
      }
      return flags;
    },
  );

  protected readonly voiceRooms = computed<IVoiceListRoom[]>(() => {
    const rooms = this.voiceRoomSource();
    const roomsState = this.voiceLobbyStore.roomsState();
    const currentUser = this.currentUser();
    return buildVoiceRoomRows(rooms, roomsState, currentUser?.id).map(
      (room) => {
        const stack = voiceRoomStack(room.peers);
        return {
          ...room,
          shownPeers: stack.shown,
          extraLabel:
            stack.extra > 0 ? formatVoiceStackExtra(stack.extra) : null,
        };
      },
    );
  });

  ngOnInit(): void {
    this.roomsStore.loadAll();
    this.destroyRef.onDestroy(() => {
      this.roomClickGuard.destroy();
    });
  }

  /**
   * Opens via `tuiDropdownContext` `longtap` (right-click / long-press).
   * Do not bind `(tuiDropdownOpenChange)`: it activates `TuiDropdownOpen`,
   * which toggles the menu on left-click and fights room selection.
   */
  protected onRoomLongtap(room: IRoom): void {
    this.contextMenuOpenedFor.set(room);
    this.roomClickGuard.arm();
  }

  protected onRoomClick(room: IRoom): void {
    if (this.roomClickGuard.consume()) {
      return;
    }
    this.roomNavigationService.selectRoom(room);
  }

  protected openRoomDetails(room: IRoom): void {
    void this.roomManageService.openRoomDetails(room);
  }

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }
}
