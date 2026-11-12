import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiDataList, TuiOptGroup, TuiOption } from '@taiga-ui/core';

import { icons } from '@constants';
import { IRoom } from '@konvoez/shared';
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

  public readonly room = input.required<IRoom>();
  public readonly closeMenu = output<void>();

  protected readonly icons = icons;
  protected readonly canManage = this.roomManageService.canManageRooms;

  protected onOpenDetails(): void {
    void this.roomManageService.openRoomDetails(this.room());
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
