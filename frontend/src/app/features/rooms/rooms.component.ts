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
import { TranslatePipe } from '@ngx-translate/core';
import { DialogService } from 'primeng/dynamicdialog';
import { AddRoomDialogComponent } from './add-room-dialog/add-room-dialog.component';
import { IRoom, IRoomCreate } from './rooms.interface';
import { ERoomType } from '@common/enums';
import { ContextMenuModule } from 'primeng/contextmenu';
import { LogoComponent } from '../../shared/components/logo/logo.component';
import { RouterLink } from '@angular/router';
import {
  selectActiveVoiceRoomId,
  selectVoiceRoomDict,
} from '../voice-room/voice-room.selectors';
import { VoiceRoomPanelComponent } from './voice-room-panel/voice-room-panel.component';
import { VoiceRoomCommon } from '@common/voice-room';
import { RoomPeerComponent } from './room-peer/room-peer.component';
import { DividerModule } from 'primeng/divider';

interface IRoomWithPeers extends IRoom {
  peers: VoiceRoomCommon.IPeer[];
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
  ],
  providers: [DialogService],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly dialogService = inject(DialogService);

  protected readonly selectedRoomId =
    this.store.selectSignal(selectSelectedRoomId);
  protected readonly activeVoiceRoomId = this.store.selectSignal(
    selectActiveVoiceRoomId,
  );

  protected readonly textRooms = this.store.selectSignal(selectTextRoomsList);

  private readonly _voiceRooms = this.store.selectSignal(selectVoiceRoomsList);
  private readonly voiceRoomsState =
    this.store.selectSignal(selectVoiceRoomDict);
  protected readonly voiceRooms = computed<IRoomWithPeers[]>(() => {
    const voiceRooms = this._voiceRooms();
    const voiceRoomsState = this.voiceRoomsState();
    return voiceRooms.map((item) => ({
      ...item,
      peers: voiceRoomsState[item.id]?.peers ?? [],
    }));
  });

  protected readonly ERoomType = ERoomType;

  ngOnInit(): void {
    this.store.dispatch(RoomsActions.requestRooms());
  }

  protected addRoom($event: ERoomType): void {
    const ref = this.dialogService.open(AddRoomDialogComponent, {
      data: { type: $event },
    });
    ref?.onClose.subscribe((room: IRoomCreate) => {
      if (room) {
        this.store.dispatch(RoomsActions.requestCreateRoom({ room }));
      }
    });
  }

  protected selectRoom(room: IRoom): void {
    this.store.dispatch(RoomsActions.selectRoom({ room }));
  }
}
