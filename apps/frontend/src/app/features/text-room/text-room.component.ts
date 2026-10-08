import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { RoomsStore } from '@core/stores/rooms.store';
import { RoomContextMenuComponent } from '../rooms/room-context-menu/room-context-menu.component';
import { RoomManageService } from '../rooms/room-manage.service';
import { IRoom } from '@konvoez/shared';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { TuiButton, TuiDropdown, TuiHint } from '@taiga-ui/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-text-room',
  imports: [
    ChatComponent,
    RoomContextMenuComponent,
    TuiButton,
    TuiDropdown,
    TuiHint,
    TranslatePipe,
  ],
  templateUrl: './text-room.component.html',
  styleUrl: './text-room.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TextRoomComponent {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly roomsStore = inject(RoomsStore);
  private readonly roomManageService = inject(RoomManageService);

  protected readonly canManageRooms = this.roomManageService.canManageRooms;

  protected readonly roomId = toSignal(
    this.activatedRoute.paramMap.pipe(
      map((params) => {
        const id = Number(params.get('id'));
        return Number.isFinite(id) && id > 0 ? id : null;
      }),
    ),
    { initialValue: null },
  );

  protected readonly room = computed((): IRoom | null => {
    const id = this.roomId();
    const roomsDict = this.roomsDict();
    if (!id) {
      return null;
    }
    return roomsDict[id] ?? null;
  });

  protected readonly title = computed(() => this.room()?.name ?? '');
  protected readonly avatarUrl = computed(() => this.room()?.avatarUrl ?? null);

  private readonly roomsDict = this.roomsStore.roomsDict;

  constructor() {
    effect(() => {
      const id = this.roomId();
      if (id !== null) {
        untracked(() => {
          this.roomsStore.loadOne(id);
        });
      }
    });
  }

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }
}
