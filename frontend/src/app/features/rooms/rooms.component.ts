import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { RoomsActions } from './rooms.actions';
import { selectTextRoomsList, selectVoiceRoomsList } from './rooms.selectors';
import { ListboxModule } from 'primeng/listbox';
import { ButtonModule } from 'primeng/button';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslateService } from '@ngx-translate/core';
import { ERoomType } from './rooms.enum';
import { DialogService } from 'primeng/dynamicdialog';
import { AddRoomDialogComponent } from './add-room-dialog/add-room-dialog.component';
import { IRoomCreate } from './rooms.interface';

@Component({
  selector: 'app-rooms',
  imports: [ListboxModule, ButtonModule],
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
  protected readonly groupedRooms = computed(() => {
    const textRooms = this.textRooms();
    const voiceRooms = this.voiceRooms();
    return [
      {
        label: this.translateService.instant('ROOMS.TEXT'),
        value: ERoomType.TEXT,
        items: textRooms,
      },
      {
        label: this.translateService.instant('ROOMS.VOICE'),
        value: ERoomType.VOICE,
        items: voiceRooms,
      },
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
}
