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
import { RoomsActions } from './rooms.actions';
import {
  selectSelectedRoomId,
  selectTextRoomsList,
  selectVoiceRoomsList,
} from './rooms.selectors';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import type { RoomDialogData } from './room-dialog/room-dialog.component';
import { IRoom, IRoomCreate } from './rooms.interface';
import { ERoomType, IUser } from '@konvoez/shared';
import { RoomPeerComponent } from './room-peer/room-peer.component';
import { RoomContextMenuComponent } from './room-context-menu/room-context-menu.component';
import { RoomManageService } from './room-manage.service';
import { VoiceLobbyStore } from '@core/voice/voice-lobby.store';
import { VoiceSessionStore } from '@core/voice/voice-session.store';
import { DirectCallService } from '@core/services/direct-call.service';
import {
  TuiButton,
  TuiDialogService,
  TuiDropdown,
  TuiHint,
  TuiIcon,
} from '@taiga-ui/core';
import {
  TuiAutoColorPipe,
  TuiAvatar,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { UnreadCountsStore } from '@core/chat/unread-counts.store';
import { TuiNavigation } from '@taiga-ui/layout';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { UsersStore } from '@features/users/users.store';
import { Router, RouterLink } from '@angular/router';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { UserAvatarComponent } from '@shared/components/user-avatar/user-avatar.component';
import { PulseIndicatorComponent } from '@shared/components/pulse-indicator/pulse-indicator.component';
import { WA_IS_TOUCH } from '@ng-web-apis/platform';

interface IRoomWithPeers extends IRoom {
  peers: IUser[];
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
    NgOptimizedImage,
    NgTemplateOutlet,
  ],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly usersStore = inject(UsersStore);
  private readonly translateService = inject(TranslateService);
  private readonly voiceSessionStore = inject(VoiceSessionStore);
  private readonly voiceLobbyStore = inject(VoiceLobbyStore);
  private readonly directCallService = inject(DirectCallService);
  private readonly router = inject(Router);
  private readonly tuiDialogService = inject(TuiDialogService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isTouch = inject(WA_IS_TOUCH);
  private readonly roomManageService = inject(RoomManageService);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  public readonly collapsed = input.required<boolean>();

  protected readonly selectedRoomId =
    this.store.selectSignal(selectSelectedRoomId);
  protected readonly activeVoiceRoomId = this.voiceSessionStore.selectedRoomId;

  protected readonly textRooms = this.store.selectSignal(selectTextRoomsList);

  protected readonly voiceRooms = computed<IRoomWithPeers[]>(() => {
    const voiceRooms = this._voiceRooms();
    const voiceRoomsState = this.voiceLobbyStore.roomsState();
    const currentUser = this.currentUser();

    return voiceRooms.map((item) => {
      const peers = Object.values(voiceRoomsState[item.id] ?? {});
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
    return users[userId] ?? null;
  });

  protected readonly contextMenuOpenedFor = signal<IRoom | null>(null);

  protected readonly ERoomType = ERoomType;

  protected readonly canManageRooms = this.roomManageService.canManageRooms;

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly _voiceRooms = this.store.selectSignal(selectVoiceRoomsList);

  /** Suppresses the synthetic click that can follow a long-press on touch devices. */
  private suppressNextRoomClick = false;
  private suppressRoomClickTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.store.dispatch(RoomsActions.requestRooms());
    this.usersStore.loadAll();
    this.destroyRef.onDestroy(() => this.clearRoomClickSuppression());
  }

  protected openHangingCall(peer: IUser): void {
    void this.router.navigate(['/direct', peer.id]);
  }

  protected async addRoom(type: ERoomType): Promise<void> {
    const { RoomDialogComponent } =
      await import('./room-dialog/room-dialog.component');

    this.tuiDialogService
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
          };

          this.store.dispatch(RoomsActions.requestCreateRoom({ room: body }));
        },
      });
  }

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }

  protected selectRoom(room: IRoom): void {
    this.store.dispatch(RoomsActions.selectRoom({ room }));
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
}
