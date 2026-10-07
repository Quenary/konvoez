import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  TemplateRef,
} from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiDropdown, TuiHint, TuiTitle } from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import { TuiAvatar, TuiInitialsPipe } from '@taiga-ui/kit';
import { IRoom } from '@konvoez/shared';
import { RoomContextMenuComponent } from '@features/rooms/room-context-menu/room-context-menu.component';
import { RoomManageService } from '@features/rooms/room-manage.service';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceRoomControlsBarComponent } from '../voice-room-controls-bar/voice-room-controls-bar.component';
import { VoiceRoomTheatreWatchControlsComponent } from '../voice-room-theatre-watch-controls/voice-room-theatre-watch-controls.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceRoomTilesService } from '../voice-room-tiles.service';
import { showsRemoteScreenWatchControls } from '../voice-room-tiles';

@Component({
  selector: 'app-voice-room-overlay',
  host: {
    '[class.visible]': 'chromeVisible()',
    '[attr.aria-hidden]': 'chromeVisible() ? null : true',
  },
  imports: [
    NgOptimizedImage,
    NgTemplateOutlet,
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
    VoiceRoomTheatreWatchControlsComponent,
  ],
  templateUrl: './voice-room-overlay.component.html',
  styleUrl: './voice-room-overlay.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomOverlayComponent {
  private readonly store = inject(Store);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly voiceRoomTilesService = inject(VoiceRoomTilesService);
  private readonly voiceRoomActionsService = inject(VoiceRoomActionsService);
  private readonly roomManageService = inject(RoomManageService);
  private readonly voiceLeaveService = inject(VoiceLeaveService);

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly room = input<IRoom | null>(null);
  public readonly title = input<string>('');
  public readonly avatarUrl = input<string | null>(null);
  public readonly participantsCount = input(0);
  public readonly fullscreenTarget = input<HTMLElement | null>(null);
  public readonly headerActions = input<TemplateRef<unknown> | null>(null);
  public readonly left = output<void>();

  protected readonly canManageRooms = this.roomManageService.canManageRooms;
  protected readonly chromeVisible = this.voiceRoomViewService.chromeVisible;
  protected readonly layout = this.voiceRoomViewService.layout;
  protected readonly showRemoteScreenWatchControls = computed(() =>
    showsRemoteScreenWatchControls(
      this.voiceRoomTilesService.theatreTile(),
      this.currentUser()?.id ?? null,
    ),
  );

  protected readonly watchUserId = computed(
    () => this.voiceRoomTilesService.theatreTile()?.peerId ?? null,
  );
  protected readonly isFullscreen = this.voiceRoomViewService.isFullscreen;

  protected readonly layoutToggleIcon = computed(() =>
    this.layout() === 'theatre'
      ? '@tui.layout-grid'
      : '@tui.gallery-horizontal',
  );

  protected readonly canToggleLayout = computed(() => {
    const layout = this.layout();
    const tilesCount = this.voiceRoomTilesService.tiles().length;
    return layout === 'theatre' || tilesCount > 0;
  });

  protected readonly layoutToggleHintKey = computed(() =>
    this.layout() === 'theatre' ? 'CALL.SHOW_GRID' : 'CALL.SHOW_THEATRE',
  );

  protected readonly displayTitle = computed(() => {
    const title = this.title();
    const roomName = this.room()?.name ?? '';
    return title || roomName;
  });

  protected readonly displayAvatarUrl = computed(() => {
    const avatarUrl = this.avatarUrl();
    const roomAvatar = this.room()?.avatarUrl ?? null;
    return avatarUrl ?? roomAvatar ?? '';
  });

  protected editRoom(room: IRoom): Promise<void> {
    return this.roomManageService.editRoom(room);
  }

  protected deleteRoom(room: IRoom): void {
    this.roomManageService.deleteRoom(room);
  }

  protected onToggleFullscreen(): void {
    void this.voiceRoomViewService.toggleFullscreen(this.fullscreenTarget());
  }

  protected onToggleLayout(): void {
    this.voiceRoomActionsService.toggleLayout();
  }

  protected async onHangup(): Promise<void> {
    // Emit before leave: leave clears activeSession mid-await, which resets
    // the layout to grid and re-creates the projected overlay, destroying this
    // instance. Emitting after await would drop navigation to `/`.
    this.left.emit();
    await this.voiceLeaveService.leaveActiveVoice();
  }
}
