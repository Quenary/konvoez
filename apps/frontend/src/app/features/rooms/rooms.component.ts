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
import { ERoomType } from '@konvoez/shared';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { RouterLink } from '@angular/router';
import { VoiceRoomPanelComponent } from './voice-room-panel/voice-room-panel.component';
import { RoomPeerComponent } from './room-peer/room-peer.component';
import { UserCommon } from '@konvoez/shared';
import { VoiceRoomService } from '@core/services/voice-room.service';
import {
  TuiButton,
  TuiIcon,
  TuiDialogService,
  tuiDropdown,
  TuiDropdown,
  TuiDropdownContext,
  TuiOption,
  TuiAppearance,
  TuiDataList,
} from '@taiga-ui/core';
import {
  TUI_CONFIRM,
  TuiAutoColorPipe,
  TuiAvatar,
  TuiAvatarStack,
  TuiChevron,
  TuiConfirmData,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { TuiNavigation } from '@taiga-ui/layout';
import { PolymorpheusComponent } from '@taiga-ui/polymorpheus';
import { TuiResponsiveDialogService } from '@taiga-ui/addon-mobile';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { SlicePipe } from '@angular/common';

interface IRoomWithPeers extends IRoom {
  peers: UserCommon.IUser[];
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
    TuiButton,
    TuiNavigation,
    TuiInitialsPipe,
    TuiDropdown,
    TuiOption,
    TuiDataList,
    TuiAvatarStack,
    SlicePipe,
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
          if (!room) return;

          this.store.dispatch(
            RoomsActions.requestCreateRoom({ room: room as IRoomCreate }),
          );
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
          if (!data) return;

          const { id, ...room } = data;
          this.store.dispatch(
            RoomsActions.requestUpdateRoom({
              id: id as number,
              room: room as IRoomUpdate,
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
