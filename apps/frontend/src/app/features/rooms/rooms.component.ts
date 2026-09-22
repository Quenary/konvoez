import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { IRoom, IRoomCreate, IRoomUpdate } from './rooms.interface';
import { ERoomType, IUser } from '@konvoez/shared';
import { RoomPeerComponent } from './room-peer/room-peer.component';
import { VoiceRoomService } from '@core/services/voice-room.service';
import {
  TuiButton,
  TuiDialogService,
  TuiDropdown,
  TuiIcon,
  TuiOption,
  TuiDataList,
} from '@taiga-ui/core';
import {
  TUI_CONFIRM,
  TuiAvatar,
  TuiBadgedContent,
  TuiBadgeNotification,
  TuiConfirmData,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { UnreadCountsStore } from '@features/text-room/unread-counts.store';
import { TuiNavigation } from '@taiga-ui/layout';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { UsersStore } from '@features/users/users.store';
import { RouterLink } from '@angular/router';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';

interface IRoomWithPeers extends IRoom {
  peers: IUser[];
  isUserInRoom: boolean;
}

@Component({
  selector: 'app-rooms',
  imports: [
    RouterLink,
    TranslatePipe,
    RoomPeerComponent,
    //
    TuiAvatar,
    TuiBadgedContent,
    TuiBadgeNotification,
    TuiButton,
    TuiIcon,
    TuiNavigation,
    TuiInitialsPipe,
    TuiDropdown,
    TuiOption,
    TuiDataList,
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
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly tuiDialogService = inject(TuiDialogService);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );
  private readonly injector = inject(Injector);
  protected readonly unreadCountsStore = inject(UnreadCountsStore);

  public readonly collapsed = input.required<boolean>();

  protected readonly selectedRoomId =
    this.store.selectSignal(selectSelectedRoomId);
  protected readonly activeVoiceRoomId = this.voiceRoomService.selectedRoomId;

  protected readonly textRooms = this.store.selectSignal(selectTextRoomsList);

  protected readonly voiceRooms = computed<IRoomWithPeers[]>(() => {
    const voiceRooms = this._voiceRooms();
    const voiceRoomsState = this.voiceRoomService.roomsState();
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

  protected readonly contextMenuOpenedFor = signal<IRoom | null>(null);

  protected readonly ERoomType = ERoomType;

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);
  private readonly _voiceRooms = this.store.selectSignal(selectVoiceRoomsList);

  ngOnInit(): void {
    this.store.dispatch(RoomsActions.requestRooms());
    this.usersStore.loadAll();
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

  protected async editRoom(room: IRoom): Promise<void> {
    const { RoomDialogComponent } =
      await import('./room-dialog/room-dialog.component');

    this.tuiDialogService
      .open<RoomDialogData>(
        new PolymorpheusComponent(RoomDialogComponent, this.injector),
        {
          closable: true,
          data: room,
          label: this.translateService.instant('ROOMS.DIALOG.EDIT_HEADER'),
        },
      )
      .subscribe({
        next: (data) => {
          if (!data?.id || !data.name) return;

          const body: IRoomUpdate = {
            name: data.name,
            ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
          };

          this.store.dispatch(
            RoomsActions.requestUpdateRoom({
              id: data.id,
              room: body,
            }),
          );
        },
      });
  }

  protected deleteRoom(room: IRoom): void {
    this.tuiResponsiveDialogService
      .open<boolean>(TUI_CONFIRM, {
        label: this.translateService.instant('ROOMS.DELETE_CONFIRM'),
        data: {
          yes: this.translateService.instant('GENERAL.DELETE'),
          no: this.translateService.instant('GENERAL.CANCEL'),
        } satisfies TuiConfirmData,
      })
      .subscribe((res) => {
        if (!res) return;

        this.store.dispatch(RoomsActions.requestDeleteRoom({ id: room.id }));
      });
  }

  protected selectRoom(room: IRoom): void {
    this.store.dispatch(RoomsActions.selectRoom({ room }));
  }
}
