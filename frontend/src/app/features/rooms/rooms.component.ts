import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsActions } from './rooms.actions';
import { selectTextRoomsList, selectVoiceRoomsList } from './rooms.selectors';
import { ListboxModule } from 'primeng/listbox';
import { ButtonModule } from 'primeng/button';
import { TranslateService } from '@ngx-translate/core';
import { DialogService } from 'primeng/dynamicdialog';
import { AddRoomDialogComponent } from './add-room-dialog/add-room-dialog.component';
import { IRoom, IRoomCreate } from './rooms.interface';
import { ERoomType } from '@common/enums';
import { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { AvatarModule } from 'primeng/avatar';
import { ContextMenuModule } from 'primeng/contextmenu';
import { LogoComponent } from '../../shared/components/logo/logo.component';
import { RouterLink } from '@angular/router';
import { AuthActions } from '../auth/auth.actions';
import { selectVoiceChatDict } from '../voice-chat/voice-chat.selectors';
import { VoiceRoomPanelComponent } from './voice-room-panel/voice-room-panel.component';

@Component({
  selector: 'app-rooms',
  imports: [
    ListboxModule,
    ButtonModule,
    MenuModule,
    AvatarModule,
    ContextMenuModule,
    LogoComponent,
    RouterLink,
    VoiceRoomPanelComponent,
  ],
  providers: [DialogService],
  templateUrl: './rooms.component.html',
  styleUrl: './rooms.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomsComponent implements OnInit {
  private readonly store = inject(Store);
  private readonly translateService = inject(TranslateService);
  private readonly dialogService = inject(DialogService);

  private readonly textRooms = this.store.selectSignal(selectTextRoomsList);
  private readonly voiceRooms = this.store.selectSignal(selectVoiceRoomsList);
  private readonly voiceRoomsState = this.store.selectSignal(selectVoiceChatDict);

  protected readonly ERoomType = ERoomType;
  protected readonly menu = computed<MenuItem[]>(() => {
    const textRooms = this.textRooms();
    const voiceRooms = this.voiceRooms();
    const voiceRoomsState = this.voiceRoomsState();
    return [
      { separator: true },
      {
        label: this.translateService.instant('ROOMS.TEXT'),
        command: () => this.addRoom(ERoomType.TEXT),
        items: textRooms.map((item) => ({
          label: item.name,
          value: item,
          command: () => this.selectRoom(item),
        })),
      },
      {
        label: this.translateService.instant('ROOMS.VOICE'),
        command: () => this.addRoom(ERoomType.VOICE),
        items: voiceRooms.map((item) => ({
          label: item.name,
          value: item,
          command: () => this.selectRoom(item),
          items: voiceRoomsState[item.id]?.peers ?? [],
        })),
      },
      { separator: true },
    ];
  });

  ngOnInit(): void {
    this.store.dispatch(RoomsActions.requestRooms());
  }

  protected addRoom($event: ERoomType): void {
    const ref = this.dialogService.open(AddRoomDialogComponent, { data: { type: $event } });
    ref?.onClose.subscribe((room: IRoomCreate) => {
      if (room) {
        console.log(room);
        this.store.dispatch(RoomsActions.requestCreateRoom({ room }));
      }
    });
  }

  protected selectRoom(room: IRoom): void {
    this.store.dispatch(RoomsActions.selectRoom({ room }));
  }

  protected logout(): void {
    this.store.dispatch(AuthActions.requestLogout());
  }
}
