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
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { PeerVideoService } from '@core/services/peer-video.service';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceRoomControlsBarComponent } from '../voice-room-controls-bar/voice-room-controls-bar.component';
import { VoiceRoomTheatreActionsComponent } from '../voice-room-theatre-actions/voice-room-theatre-actions.component';
import { VoiceRoomTheatreWatchControlsComponent } from '../voice-room-theatre-watch-controls/voice-room-theatre-watch-controls.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import {
  showsRemoteScreenWatchControls,
  type TVoiceRoomTile,
} from '../voice-room-tiles';

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
    VoiceRoomControlsBarComponent,
    VoiceRoomTheatreActionsComponent,
    VoiceRoomTheatreWatchControlsComponent,
  ],
  templateUrl: './voice-room-overlay.component.html',
  styleUrl: './voice-room-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomOverlayComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly roomManageService = inject(RoomManageService);
  private readonly voiceLeaveService = inject(VoiceLeaveService);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly room = input<IRoom | null>(null);
  public readonly participantsCount = input(0);
  public readonly fullscreenTarget = input<HTMLElement | null>(null);
  public readonly theatreTile = input<TVoiceRoomTile | null>(null);
  public readonly left = output<void>();

  protected readonly canManageRooms = this.roomManageService.canManageRooms;
  protected readonly chromeVisible = this.voiceRoomViewService.chromeVisible;
  protected readonly theatreOpen = this.voiceRoomViewService.theatreOpen;
  protected readonly showRemoteScreenWatchControls = computed(() => {
    const tile = this.theatreTile();
    const localUserId = this.currentUser()?.id ?? null;
    const watching = this.peerVideoService.watchingUserIds();
    return showsRemoteScreenWatchControls(
      tile ? { peerId: tile.peerId, stream: tile.streamKind } : null,
      localUserId,
      watching,
    );
  });

  protected readonly watchUserId = computed(
    () => this.theatreTile()?.peerId ?? null,
  );
  protected readonly isFullscreen = this.voiceRoomViewService.isFullscreen;

  protected readonly avatarUrl = computed(() => this.room()?.avatarUrl ?? '');
  protected readonly roomName = computed(() => this.room()?.name ?? '');

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }

  protected async onHangup(): Promise<void> {
    await this.voiceLeaveService.leaveActiveVoice();
    this.left.emit();
  }
}
