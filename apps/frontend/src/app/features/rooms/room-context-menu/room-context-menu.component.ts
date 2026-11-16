import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiDataList, TuiOptGroup, TuiOption } from '@taiga-ui/core';

import { icons } from '@constants';
import { ERoomType, IRoom } from '@konvoez/shared';
import { RoomsStore } from '@core/stores/rooms.store';
import { RoomManageService } from '../room-manage.service';

@Component({
  selector: 'app-room-context-menu',
  imports: [TranslatePipe, TuiDataList, TuiOptGroup, TuiOption],
  templateUrl: './room-context-menu.component.html',
  styleUrl: './room-context-menu.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoomContextMenuComponent {
  private readonly roomManageService = inject(RoomManageService);
  private readonly roomsStore = inject(RoomsStore);

  public readonly room = input.required<IRoom>();
  public readonly closeMenu = output<void>();

  protected readonly icons = icons;
  protected readonly canManage = this.roomManageService.canManageRooms;

  protected readonly canMoveUp = computed(() => {
    const room = this.room();
    const list =
      room.type === ERoomType.TEXT
        ? this.roomsStore.textRooms()
        : this.roomsStore.voiceRooms();
    const idx = list.findIndex((r) => r.id === room.id);
    return idx > 0;
  });

  protected readonly canMoveDown = computed(() => {
    const room = this.room();
    const list =
      room.type === ERoomType.TEXT
        ? this.roomsStore.textRooms()
        : this.roomsStore.voiceRooms();
    const idx = list.findIndex((r) => r.id === room.id);
    return idx >= 0 && idx < list.length - 1;
  });

  protected onOpenDetails(): void {
    void this.roomManageService.openRoomDetails(this.room());
    this.closeMenu.emit();
  }

  protected onMoveUp(): void {
    if (!this.canMoveUp()) return;
    this.roomManageService.moveRoom(this.room(), 'up');
    this.closeMenu.emit();
  }

  protected onMoveDown(): void {
    if (!this.canMoveDown()) return;
    this.roomManageService.moveRoom(this.room(), 'down');
    this.closeMenu.emit();
  }

  protected async onEdit(): Promise<void> {
    await this.roomManageService.editRoom(this.room());
    this.closeMenu.emit();
  }

  protected onDelete(): void {
    this.roomManageService.deleteRoom(this.room());
    this.closeMenu.emit();
  }
}
