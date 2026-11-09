import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsStore } from '@core/stores/rooms.store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import type { RoomDialogData } from './room-dialog/room-dialog.component';
import {
  EPermission,
  ERoomType,
  IRoom,
  IRoomCreate,
  IUserSafe,
  TVoiceRoomPeerUser,
} from '@konvoez/shared';
import { RoomPeerComponent } from './room-peer/room-peer.component';
import { RoomContextMenuComponent } from './room-context-menu/room-context-menu.component';
import { RoomManageService } from './room-manage.service';
import { RoomNavigationService } from './room-navigation.service';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceSessionService } from '@core/services/voice-session.service';
import { DirectCallService } from '@core/services/direct-call.service';
import {
  TuiButton,
  TuiDataList,
  TuiDropdown,
  TuiHint,
  TuiIcon,
  TuiNotificationService,
  TuiOptGroup,
  TuiOption,
} from '@taiga-ui/core';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import {
  TuiAutoColorPipe,
  TuiAvatar,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiFade,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { TuiNavigation } from '@taiga-ui/layout';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { UsersStore } from '@core/stores/users.store';
import { Router, RouterLink } from '@angular/router';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';
import { UserDialogService } from '@shared/user-dialog/user-dialog.service';
import { LayoutService } from '@core/services/layout.service';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
} from '@angular/cdk/drag-drop';
import { icons } from '@constants';

export interface IRoomPeerWithCanMove extends TVoiceRoomPeerUser {
  canMove: boolean;
}

export interface IRoomWithPeers extends IRoom {
  peers: IRoomPeerWithCanMove[];
  isUserInRoom: boolean;
}

@Component({
  selector: 'app-rooms',
  host: {
    '[class.collapsed]': 'collapsed()',
  },
  imports: [
    RouterLink,
    TranslatePipe,
    RoomPeerComponent,
    RoomContextMenuComponent,
    UserAvatarComponent,
    PulseIndicatorComponent,
    TuiAvatar,
    TuiAutoColorPipe,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiButton,
    TuiHint,
    TuiIcon,
    TuiNavigation,
    TuiInitialsPipe,
    TuiDropdown,
    TuiDataList,
    TuiOptGroup,
    TuiOption,
    NgOptimizedImage,
    NgTemplateOutlet,
    TuiFade,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
  ],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly ngrxStore = inject(Store);
  private readonly roomsStore = inject(RoomsStore);
  private readonly usersStore = inject(UsersStore);
  private readonly translateService = inject(TranslateService);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly voiceSessionService = inject(VoiceSessionService);
  private readonly directCallService = inject(DirectCallService);
  private readonly router = inject(Router);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly tuiNotificationsService = inject(TuiNotificationService);
  private readonly userDialogService = inject(UserDialogService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isTouch = inject(WA_IS_TOUCH);
  private readonly roomManageService = inject(RoomManageService);
  private readonly roomNavigationService = inject(RoomNavigationService);
  private readonly layoutService = inject(LayoutService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  public readonly collapsed = input.required<boolean>();

  protected readonly icons = icons;
  protected readonly isNarrow = this.layoutService.isNarrow;
  protected readonly textRooms = this.roomsStore.textRooms;
  protected readonly dragStartDelay = { touch: 300, mouse: 0 };

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
    const voiceRooms = this._voiceRooms();
    const voiceRoomsState = this.voiceLobbyStore.roomsState();
    const currentUser = this.currentUser();
    const canMove = this.canMoveMembers();
    const isActorOwner = Boolean(currentUser?.isOwner);

    return voiceRooms.map((item) => {
      const peers = Object.values(voiceRoomsState[item.id] ?? {}).map(
        (peer) => ({
          ...peer,
          canMove: canMove && (!peer.isOwner || isActorOwner),
        }),
      );
      const isUserInRoom = peers.some((item) => item.id === currentUser?.id);
      return {
        ...item,
        peers,
        isUserInRoom,
      };
    });
  });

  protected readonly hangingCallPeer = computed(() => {
    const userId = this.directCallService.hangingCallUserId();
    const users = this.usersStore.entityMap();
    if (userId === null) {
      return null;
    }
    const interlocutor = this.directCallService.interlocutor();
    return users[userId] ?? (interlocutor?.id === userId ? interlocutor : null);
  });

  protected readonly contextMenuOpenedFor = signal<IRoom | null>(null);

  protected readonly selectedPeerForMenu = signal<{
    peer: IRoomPeerWithCanMove;
    roomId: number;
  } | null>(null);

  /** Room the dragged member has entered. CDK's dragging class stays on every list. */
  protected readonly dropTargetRoomId = signal<number | null>(null);

  protected readonly moveTargetRooms = computed<IRoomWithPeers[]>(() => {
    const selected = this.selectedPeerForMenu();
    const rooms = this.voiceRooms();
    if (!selected) {
      return [];
    }
    return rooms.filter((room) => room.id !== selected.roomId);
  });

  protected readonly ERoomType = ERoomType;

  protected readonly canManageRooms = this.roomManageService.canManageRooms;

  private readonly currentUser = this.ngrxStore.selectSignal(selectCurrentUser);
  private readonly _voiceRooms = this.roomsStore.voiceRooms;

  /** Suppresses the synthetic click that can follow a long-press on touch devices. */
  private suppressNextRoomClick = false;
  private suppressRoomClickTimer: ReturnType<typeof setTimeout> | null = null;

  private suppressNextPeerClick = false;
  private suppressPeerClickTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.roomsStore.loadAll();
    this.usersStore.loadAll();
    this.destroyRef.onDestroy(() => {
      this.clearRoomClickSuppression();
      this.clearPeerClickSuppression();
    });
  }

  protected openHangingCall(peer: IUserSafe): void {
    void this.router.navigate(['/direct', peer.id]);
  }

  protected async addRoom(type: ERoomType): Promise<void> {
    const { RoomDialogComponent } =
      await import('./room-dialog/room-dialog.component');

    this.tuiResponsiveDialogService
      .open<RoomDialogData>(
        new PolymorpheusComponent(RoomDialogComponent, this.injector),
        {
          closable: true,
          data: { type },
          label: this.translateService.instant('ROOMS.DIALOG.ADD_HEADER'),
        },
      )
      .subscribe({
        next: (room) => {
          if (!room?.name || !room.type) return;

          const body: IRoomCreate = {
            name: room.name,
            type: room.type,
            ...(room.avatar ? { avatar: room.avatar } : {}),
            ...(room.isPrivate !== undefined
              ? { isPrivate: room.isPrivate }
              : {}),
            ...(room.allowedRoleIds !== undefined
              ? { allowedRoleIds: room.allowedRoleIds }
              : {}),
            ...(room.allowedUserIds !== undefined
              ? { allowedUserIds: room.allowedUserIds }
              : {}),
          };

          this.roomsStore.create(body);
        },
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

  protected selectRoom(room: IRoom): void {
    this.roomNavigationService.selectRoom(room);
  }

  /**
   * Opens via `tuiDropdownContext` `longtap` (right-click / long-press).
   * Do not bind `(tuiDropdownOpenChange)`: it activates `TuiDropdownOpen`,
   * which toggles the menu on left-click and fights room selection.
   */
  protected onRoomLongtap(room: IRoom): void {
    this.contextMenuOpenedFor.set(room);

    // Desktop right-click does not emit a follow-up click.
    if (!this.isTouch()) {
      return;
    }

    this.suppressNextRoomClick = true;
    this.clearRoomClickSuppressionTimer();

    // Safety clear if no synthetic click arrives (e.g. some Android browsers).
    this.suppressRoomClickTimer = setTimeout(() => {
      this.suppressNextRoomClick = false;
      this.suppressRoomClickTimer = null;
    }, 1000);
  }

  protected onRoomClick(room: IRoom): void {
    if (this.suppressNextRoomClick) {
      this.clearRoomClickSuppression();
      return;
    }

    this.selectRoom(room);
  }

  protected onPeerLongtap(
    peer: IRoomPeerWithCanMove,
    room: IRoomWithPeers,
  ): void {
    if (!peer.canMove) {
      return;
    }
    this.selectedPeerForMenu.set({ peer, roomId: room.id });

    if (!this.isTouch()) {
      return;
    }

    this.suppressNextPeerClick = true;
    this.clearPeerClickSuppressionTimer();

    this.suppressPeerClickTimer = setTimeout(() => {
      this.suppressNextPeerClick = false;
      this.suppressPeerClickTimer = null;
    }, 1000);
  }

  protected onPeerClick(peer: TVoiceRoomPeerUser): void {
    if (this.suppressNextPeerClick) {
      this.clearPeerClickSuppression();
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
    this.tuiNotificationsService
      .open(message, {
        appearance: 'error',
        autoClose: 5000,
        closable: true,
      })
      .subscribe();
  }

  private clearRoomClickSuppression(): void {
    this.suppressNextRoomClick = false;
    this.clearRoomClickSuppressionTimer();
  }

  private clearRoomClickSuppressionTimer(): void {
    if (!this.suppressRoomClickTimer) {
      return;
    }

    clearTimeout(this.suppressRoomClickTimer);
    this.suppressRoomClickTimer = null;
  }

  private clearPeerClickSuppression(): void {
    this.suppressNextPeerClick = false;
    this.clearPeerClickSuppressionTimer();
  }

  private clearPeerClickSuppressionTimer(): void {
    if (!this.suppressPeerClickTimer) {
      return;
    }

    clearTimeout(this.suppressPeerClickTimer);
    this.suppressPeerClickTimer = null;
  }
}
