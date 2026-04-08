import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsActions } from './rooms.actions';
import {
  selectSelectedRoomId,
  selectTextRoomsList,
  selectVoiceRoomsList,
} from './rooms.selectors';
import { ButtonModule } from 'primeng/button';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DialogService } from 'primeng/dynamicdialog';
import { RoomDialogComponent } from './room-dialog/room-dialog.component';
import { IRoom } from './rooms.interface';
import { ERoomType } from '@common/enums';
import { ContextMenuModule } from 'primeng/contextmenu';
import { LogoComponent } from '@shared/components/logo/logo.component';
import { RouterLink } from '@angular/router';
import { VoiceRoomPanelComponent } from './voice-room-panel/voice-room-panel.component';
import { VoiceRoomCommon } from '@common/voice-room';
import { RoomPeerComponent } from './room-peer/room-peer.component';
import { DividerModule } from 'primeng/divider';
import { ConfirmationService, MenuItem } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { UserCommon } from '@common/user';
import { VoiceRoomService } from '@app/core/services/voice-room.service';

interface IRoomWithMenu extends IRoom {
  menu: MenuItem[];
}
interface IRoomWithUsers extends IRoomWithMenu {
  users: UserCommon.IUser[];
}

@Component({
  selector: 'app-rooms',
  imports: [
    ButtonModule,
    ContextMenuModule,
    LogoComponent,
    RouterLink,
    VoiceRoomPanelComponent,
    TranslatePipe,
    RoomPeerComponent,
    DividerModule,
    ConfirmDialogModule,
  ],
  providers: [DialogService, ConfirmationService],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly dialogService = inject(DialogService);
  private readonly translateService = inject(TranslateService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly voiceRoomService = inject(VoiceRoomService);

  protected readonly selectedRoomId =
    this.store.selectSignal(selectSelectedRoomId);
  protected readonly activeVoiceRoomId = this.voiceRoomService.selectedRoomId;

  private readonly _textRooms = this.store.selectSignal(selectTextRoomsList);
  protected readonly textRooms = computed<IRoomWithMenu[]>(() => {
    const textRooms = this._textRooms();
    return textRooms.map((item) => ({
      ...item,
      menu: [
        {
          label: this.translateService.instant('GENERAL.EDIT'),
          command: () => this.editRoom(item),
        },
        {
          label: this.translateService.instant('GENERAL.DELETE'),
          command: () => this.deleteRoom(item),
        },
      ],
    }));
  });

  private readonly _voiceRooms = this.store.selectSignal(selectVoiceRoomsList);
  protected readonly voiceRooms = computed<IRoomWithUsers[]>(() => {
    const voiceRooms = this._voiceRooms();
    const voiceRoomsState = this.voiceRoomService.roomsState();
    return voiceRooms.map((item) => ({
      ...item,
      users: Object.values(voiceRoomsState[item.id] ?? {}) ?? [],
      menu: [
        {
          label: this.translateService.instant('GENERAL.EDIT'),
          command: () => this.editRoom(item),
        },
        {
          label: this.translateService.instant('GENERAL.DELETE'),
          command: () => this.deleteRoom(item),
        },
      ],
    }));
  });

  protected readonly ERoomType = ERoomType;

  ngOnInit(): void {
    this.store.dispatch(RoomsActions.requestRooms());
  }

  protected addRoom(type: ERoomType): void {
    const ref = this.dialogService.open(RoomDialogComponent, {
      closeOnEscape: true,
      closable: true,
      header: this.translateService.instant('ROOMS.DIALOG.ADD_HEADER'),
      data: { type: type },
    });
    ref?.onClose.subscribe(({ room }) => {
      if (room) {
        this.store.dispatch(RoomsActions.requestCreateRoom({ room }));
      }
    });
  }

  protected editRoom(room: IRoom): void {
    const ref = this.dialogService.open(RoomDialogComponent, {
      closeOnEscape: true,
      closable: true,
      header: this.translateService.instant('ROOMS.DIALOG.EDIT_HEADER'),
      data: room,
    });
    ref?.onClose.subscribe(({ id, room }) => {
      if (id && room) {
        this.store.dispatch(RoomsActions.requestUpdateRoom({ id, room }));
      }
    });
  }

  protected deleteRoom(room: IRoom): void {
    this.confirmationService.confirm({
      message: this.translateService.instant('ROOMS.DELETE_CONFIRM'),
      closable: false,
      rejectButtonProps: {
        label: this.translateService.instant('GENERAL.CANCEL'),
        severity: 'contrast',
      },
      acceptButtonProps: {
        label: this.translateService.instant('GENERAL.DELETE'),
        severity: 'danger',
      },
      accept: () => {
        this.store.dispatch(RoomsActions.requestDeleteRoom({ id: room.id }));
      },
    });
  }

  protected selectRoom(room: IRoom): void {
    this.store.dispatch(RoomsActions.selectRoom({ room }));
  }
}
