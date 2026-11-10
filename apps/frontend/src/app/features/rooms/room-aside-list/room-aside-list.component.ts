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
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  TuiDataList,
  TuiDropdown,
  TuiNotificationService,
  TuiOptGroup,
  TuiOption,
} from '@taiga-ui/core';
import {
  TuiAvatar,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiFade,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import {
  EPermission,
  ERoomType,
  IRoom,
  TVoiceRoomPeerUser,
} from '@konvoez/shared';
import { RoomsStore } from '@core/stores/rooms.store';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { RoomPeerComponent } from '../room-peer/room-peer.component';
import { RoomContextMenuComponent } from '../room-context-menu/room-context-menu.component';
import { RoomManageService } from '../room-manage.service';
import { RoomNavigationService } from '../room-navigation.service';
import { createLongtapClickGuard } from '../room-longtap';
import { buildVoiceRoomRows, IVoiceRoomRow } from '../voice-room-rows';

export interface IRoomPeerWithCanMove extends TVoiceRoomPeerUser {
  canMove: boolean;
}

export interface IRoomWithPeers extends IVoiceRoomRow {
  peers: IRoomPeerWithCanMove[];
}

@Component({
  selector: 'app-room-aside-list',
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    TranslatePipe,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    TuiAvatar,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiFade,
    TuiInitialsPipe,
    TuiNavigation,
    TuiDropdown,
    TuiDataList,
    TuiOptGroup,
    TuiOption,
    PulseIndicatorComponent,
    RoomPeerComponent,
    RoomContextMenuComponent,
  ],
  templateUrl: './room-aside-list.component.html',
  styleUrl: './room-aside-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomAsideListComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly roomsStore = inject(RoomsStore);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly roomManageService = inject(RoomManageService);
  private readonly roomNavigationService = inject(RoomNavigationService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);
  private readonly userDialogService = inject(UserDialogService);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly isTouch = inject(WA_IS_TOUCH);
  private readonly destroyRef = inject(DestroyRef);
  private readonly roomClickGuard = createLongtapClickGuard(() =>
    this.isTouch(),
  );
  private readonly peerClickGuard = createLongtapClickGuard(() =>
    this.isTouch(),
  );

  public readonly type = input.required<ERoomType>();
  public readonly collapsed = input<boolean>(false);

  protected readonly ERoomType = ERoomType;
  protected readonly textRooms = this.roomsStore.textRooms;
  protected readonly dragStartDelay = { touch: 300, mouse: 0 };
  protected readonly canManageRooms = this.roomManageService.canManageRooms;
  protected readonly contextMenuOpenedFor = signal<IRoom | null>(null);
  protected readonly selectedPeerForMenu = signal<{
    peer: IRoomPeerWithCanMove;
    roomId: number;
  } | null>(null);
  protected readonly dropTargetRoomId = signal<number | null>(null);

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

  protected readonly canMoveMembers = computed<boolean>(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MOVE_MEMBERS),
    );
  });

  protected readonly voiceRooms = computed<IRoomWithPeers[]>(() => {
    const rooms = this.voiceRoomSource();
    const roomsState = this.voiceLobbyStore.roomsState();
    const currentUser = this.currentUser();
    const canMove = this.canMoveMembers();
    const isActorOwner = Boolean(currentUser?.isOwner);
    return buildVoiceRoomRows(rooms, roomsState, currentUser?.id).map(
      (room) => ({
        ...room,
        peers: room.peers.map((peer) => ({
          ...peer,
          canMove: canMove && (!peer.isOwner || isActorOwner),
        })),
      }),
    );
  });

  protected readonly moveTargetRooms = computed<IRoomWithPeers[]>(() => {
    const selected = this.selectedPeerForMenu();
    const rooms = this.voiceRooms();
    if (!selected) {
      return [];
    }
    return rooms.filter((room) => room.id !== selected.roomId);
  });

  ngOnInit(): void {
    this.roomsStore.loadAll();
    this.destroyRef.onDestroy(() => {
      this.roomClickGuard.destroy();
      this.peerClickGuard.destroy();
    });
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

  protected onPeerLongtap(
    peer: IRoomPeerWithCanMove,
    room: IRoomWithPeers,
  ): void {
    if (!peer.canMove) {
      return;
    }
    this.selectedPeerForMenu.set({ peer, roomId: room.id });
    this.peerClickGuard.arm();
  }

  protected onPeerClick(peer: TVoiceRoomPeerUser): void {
    if (this.peerClickGuard.consume()) {
      return;
    }
    void this.userDialogService.open(peer, {
      withFiles: false,
      withInput: true,
    });
  }

  protected onMemberDragEntered(room: IRoomWithPeers): void {
    this.dropTargetRoomId.set(room.id);
  }

  protected onMemberDragExited(room: IRoomWithPeers): void {
    if (this.dropTargetRoomId() === room.id) {
      this.dropTargetRoomId.set(null);
    }
  }

  protected onMemberDragEnded(): void {
    this.dropTargetRoomId.set(null);
  }

  protected onMemberDropped(
    event: CdkDragDrop<IRoomWithPeers, IRoomWithPeers, IRoomPeerWithCanMove>,
    targetRoom: IRoomWithPeers,
  ): void {
    const peer = event.item.data;
    const sourceRoom = event.previousContainer.data;
    if (!peer || !targetRoom || !sourceRoom) {
      return;
    }
    if (sourceRoom.id === targetRoom.id) {
      return;
    }
    if (!peer.canMove) {
      return;
    }
    void this.moveMember(peer, targetRoom);
  }

  protected async moveMember(
    peer: TVoiceRoomPeerUser,
    targetRoom: IRoom,
  ): Promise<void> {
    try {
      await this.voiceSessionService.moveMember(peer.id, targetRoom.id);
    } catch (error: unknown) {
      this.notifyError(error);
    }
  }

  protected async disconnectMember(
    peer: TVoiceRoomPeerUser,
    roomId: number,
  ): Promise<void> {
    try {
      await this.voiceSessionService.disconnectMember(peer.id, roomId);
    } catch (error: unknown) {
      this.notifyError(error);
    }
  }

  private notifyError(error: unknown): void {
    const message =
      error instanceof Error
        ? error.message
        : this.translateService.instant('GENERAL.UNKNOWN_ERROR');
    this.tuiNotificationService
      .open(message, {
        appearance: 'error',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();
  }
}
