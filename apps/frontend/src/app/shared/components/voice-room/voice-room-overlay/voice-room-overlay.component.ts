import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiDropdown, TuiHint, TuiTitle } from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { IRoom } from '@features/rooms/rooms.interface';
import { RoomContextMenuComponent } from '@features/rooms/room-context-menu/room-context-menu.component';
import { RoomManageService } from '@features/rooms/room-manage.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceControlsBarComponent } from '../voice-controls-bar/voice-controls-bar.component';
import { VoiceTheatreActionsComponent } from '../voice-theatre-actions/voice-theatre-actions.component';
import { VoiceTheatreWatchControlsComponent } from '../voice-theatre-watch-controls/voice-theatre-watch-controls.component';
import { VoiceRoomViewService } from '../voice-room-view.service';

@Component({
  selector: 'app-voice-room-overlay',
  host: {
    '[class.visible]': 'chromeVisible()',
    '[attr.aria-hidden]': 'chromeVisible() ? null : true',
  },
  imports: [
    NgOptimizedImage,
    TranslatePipe,
    TuiAvatar,
    TuiButton,
    TuiDropdown,
    TuiHeader,
    TuiHint,
    TuiInitialsPipe,
    TuiTitle,
    RoomContextMenuComponent,
    VoiceControlsBarComponent,
    VoiceTheatreActionsComponent,
    VoiceTheatreWatchControlsComponent,
  ],
  templateUrl: './voice-room-overlay.component.html',
  styleUrl: './voice-room-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomOverlayComponent {
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly roomManageService = inject(RoomManageService);
  private readonly voiceLeaveService = inject(VoiceLeaveService);

  public readonly room = input<IRoom | null>(null);
  public readonly participantsCount = input(0);
  public readonly left = output<void>();

  protected readonly canManageRooms = this.roomManageService.canManageRooms;
  protected readonly chromeVisible = this.voiceRoomViewService.chromeVisible;
  protected readonly theatreOpen = this.voiceRoomViewService.theatreOpen;

  protected readonly showAccessories = computed(() => {
    const canManage = this.canManageRooms();
    const room = this.room();
    const theatreOpen = this.theatreOpen();
    return (canManage && room != null) || theatreOpen;
  });

  protected readonly avatarUrl = computed(() => this.room()?.avatarUrl ?? '');
  protected readonly roomName = computed(() => this.room()?.name ?? '');

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }

  protected async onHangup(): Promise<void> {
    this.voiceRoomViewService.closeTheatre();
    await this.voiceLeaveService.leaveActiveVoice();
    this.left.emit();
  }
}
