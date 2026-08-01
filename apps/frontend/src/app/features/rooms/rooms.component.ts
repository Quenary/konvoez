import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
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
import {
  RoomDialogComponent,
  RoomDialogData,
} from './room-dialog/room-dialog.component';
import { IRoom, IRoomCreate, IRoomUpdate } from './rooms.interface';
import { ERoomType, IUser } from '@konvoez/shared';
import { RoomPeerComponent } from './room-peer/room-peer.component';
import { VoiceRoomService } from '@core/services/voice-room.service';
import {
  TuiButton,
  TuiDialogService,
  TuiDropdown,
  TuiOption,
  TuiDataList,
} from '@taiga-ui/core';
import {
  TUI_CONFIRM,
  TuiAutoColorPipe,
  TuiAvatar,
  TuiAvatarStack,
  TuiConfirmData,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { NgOptimizedImage, SlicePipe } from '@angular/common';

interface IRoomWithPeers extends IRoom {
  peers: IUser[];
  isUserInRoom: boolean;
}

@Component({
  selector: 'app-rooms',
  imports: [
    TranslatePipe,
    RoomPeerComponent,
    //
    TuiAvatar,
    TuiButton,
    TuiNavigation,
    TuiInitialsPipe,
    TuiDropdown,
    TuiOption,
    TuiDataList,
    TuiAvatarStack,
    SlicePipe,
    NgOptimizedImage,
    TuiInitialsPipe,
    TuiAutoColorPipe,
  ],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly translateService = inject(TranslateService);
  private readonly voiceRoomService = inject(VoiceRoomService);
  private readonly tuiDialogService = inject(TuiDialogService);
  private readonly tuiResponsiveDialogService = inject(
    TuiResponsiveDialogService,
  );

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
  }

  protected addRoom(type: ERoomType): void {
    this.tuiDialogService
      .open<RoomDialogData>(new PolymorpheusComponent(RoomDialogComponent), {
        closable: true,
        data: { type },
        label: this.translateService.instant('ROOMS.DIALOG.ADD_HEADER'),
      })
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

  protected editRoom(room: IRoom): void {
    this.tuiDialogService
      .open<RoomDialogData>(new PolymorpheusComponent(RoomDialogComponent), {
        closable: true,
        data: room,
        label: this.translateService.instant('ROOMS.DIALOG.EDIT_HEADER'),
      })
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
