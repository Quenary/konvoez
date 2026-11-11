import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import {
  TuiButton,
  TuiDropdown,
  TuiHint,
  TuiIcon,
  TuiNotificationService,
} from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
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
  IUserSafe,
  TVoiceRoomPeerUser,
} from '@konvoez/shared';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { UsersStore } from '@core/stores/users.store';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { UserContextMenuComponent } from '@shared/components/user-context-menu/user-context-menu.component';
import { createLongtapClickGuard } from '@shared/functions/longtap-click-guard.function';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { icons } from '@constants';
import { RoomContextMenuComponent } from '../room-context-menu/room-context-menu.component';
import { RoomManageService } from '../room-manage.service';
import { RoomPeerComponent } from '../room-peer/room-peer.component';
import { IVoiceRoomRow, RoomViewService } from '../room-view.service';

export interface IRoomPeerWithCanMove extends TVoiceRoomPeerUser {
  canMove: boolean;
}

export interface IRoomWithPeers extends IVoiceRoomRow {
  peers: IRoomPeerWithCanMove[];
}

@Component({
  selector: 'app-room-aside-list',
  host: {
    '[class.collapsed]': 'collapsed()',
  },
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
    RouterLink,
    RouterLinkActive,
    TranslatePipe,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    TuiAutoColorPipe,
    TuiAvatar,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiButton,
    TuiFade,
    TuiHint,
    TuiIcon,
    TuiInitialsPipe,
    TuiNavigation,
    TuiDropdown,
    PulseIndicatorComponent,
    UserAvatarComponent,
    RoomPeerComponent,
    RoomContextMenuComponent,
    UserContextMenuComponent,
  ],
  providers: [RoomViewService],
  templateUrl: './room-aside-list.component.html',
  styleUrl: './room-aside-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomAsideListComponent {
  protected readonly roomView = inject(RoomViewService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);
  private readonly usersStore = inject(UsersStore);
  private readonly directCallService = inject(DirectCallService);
  private readonly router = inject(Router);
  private readonly roomManageService = inject(RoomManageService);
  private readonly store = inject(Store);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly userDialogService = inject(UserDialogService);
  private readonly tuiNotificationService = inject(TuiNotificationService);
  private readonly translateService = inject(TranslateService);
  private readonly isTouch = inject(WA_IS_TOUCH);
  private readonly destroyRef = inject(DestroyRef);

  public readonly collapsed = input.required<boolean>();

  protected readonly icons = icons;
  protected readonly ERoomType = ERoomType;
  protected readonly dragStartDelay = { touch: 300, mouse: 0 };
  protected readonly selectedPeerForMenu = signal<{
    peer: IRoomPeerWithCanMove;
    roomId: number;
  } | null>(null);
  protected readonly dropTargetRoomId = signal<number | null>(null);

  protected readonly hangingCallPeer = computed(() => {
    const userId = this.directCallService.hangingCallUserId();
    const users = this.usersStore.entityMap();
    const interlocutor = this.directCallService.interlocutor();
    if (userId === null) {
      return null;
    }
    return users[userId] ?? (interlocutor?.id === userId ? interlocutor : null);
  });

  protected readonly canMoveMembers = computed<boolean>(() => {
    const user = this.currentUser();
    return Boolean(
      user?.isOwner || user?.permissions?.includes(EPermission.MOVE_MEMBERS),
    );
  });

  protected readonly voiceRooms = computed<IRoomWithPeers[]>(() => {
    const rooms = this.roomView.voiceRows();
    const currentUser = this.currentUser();
    const canMove = this.canMoveMembers();
    const isActorOwner = Boolean(currentUser?.isOwner);
    return rooms.map((room) => ({
      ...room,
      peers: room.peers.map((peer) => ({
        ...peer,
        canMove: canMove && (!peer.isOwner || isActorOwner),
      })),
    }));
  });

  protected readonly moveTargetRooms = computed<IRoomWithPeers[]>(() => {
    const selected = this.selectedPeerForMenu();
    const rooms = this.voiceRooms();
    if (!selected) {
      return [];
    }
    return rooms.filter((room) => room.id !== selected.roomId);
  });

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly peerClickGuard = createLongtapClickGuard(() =>
    this.isTouch(),
  );

  constructor() {
    this.usersStore.loadAll();
    this.destroyRef.onDestroy(() => {
      this.peerClickGuard.destroy();
    });
  }

  protected addRoom(type: ERoomType): Promise<void> {
    return this.roomManageService.createRoom(type);
  }

  protected openHangingCall(peer: IUserSafe): void {
    void this.router.navigate(['/direct', peer.id]);
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
    this.openPeerDialog(peer);
  }

  protected openPeerDialog(peer: TVoiceRoomPeerUser): void {
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
    targetRoom: { id: number },
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
