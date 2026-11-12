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
import { TuiButton, TuiHint, TuiTitle } from '@taiga-ui/core';
import { TuiHeader } from '@taiga-ui/layout';
import {
  tuiAutoColor,
  TuiAvatar,
  TuiFade,
  TuiInitialsPipe,
} from '@taiga-ui/kit';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@core/auth/auth.selectors';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceRoomControlsBarComponent } from '../voice-room-controls-bar/voice-room-controls-bar.component';
import { VoiceRoomTheatreWatchControlsComponent } from '../voice-room-theatre-watch-controls/voice-room-theatre-watch-controls.component';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomActionsService } from '../voice-room-actions.service';
import { VoiceRoomTilesService } from '../voice-room-tiles.service';
import {
  showsLocalScreenPreviewPauseControl,
  showsRemoteScreenWatchControls,
} from '../voice-room-tiles';
import { VoiceRoomLocalScreenPreviewPauseButtonComponent } from '../voice-room-local-screen-preview-pause-button/voice-room-local-screen-preview-pause-button.component';

import { HeaderBackButtonComponent } from '@shared/components/header-back-button/header-back-button.component';
import { icons } from '@constants';

@Component({
  selector: 'app-voice-room-overlay',
  host: {
    '[class.visible]': 'chromeVisible()',
    '[attr.aria-hidden]': 'chromeVisible() ? null : true',
    '[class.with-hide]': 'withHide()',
  },
  imports: [
    HeaderBackButtonComponent,
    NgOptimizedImage,
    NgTemplateOutlet,
    TranslatePipe,
    TuiAvatar,
    TuiFade,
    TuiButton,
    TuiHeader,
    TuiHint,
    TuiInitialsPipe,
    TuiTitle,
    VoiceRoomControlsBarComponent,
    VoiceRoomTheatreWatchControlsComponent,
    VoiceRoomLocalScreenPreviewPauseButtonComponent,
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
  private readonly voiceLeaveService = inject(VoiceLeaveService);

  protected readonly icons = icons;

  public readonly title = input<string>('');
  public readonly initialsSource = input<string | null>(null);
  public readonly isDirect = input<boolean>(false);
  public readonly avatarUrl = input<string | null>(null);
  public readonly backRoute = input<string>('/voice-room');
  public readonly participantsCount = input(0);
  public readonly fullscreenTarget = input<HTMLElement | null>(null);
  public readonly headerActions = input<TemplateRef<unknown> | null>(null);
  public readonly withHide = input<boolean>(false);
  public readonly headerClick = output<void>();

  protected readonly chromeVisible = this.voiceRoomViewService.chromeVisible;
  protected readonly layout = this.voiceRoomViewService.layout;
  protected readonly showRemoteScreenWatchControls = computed(() =>
    showsRemoteScreenWatchControls(
      this.voiceRoomTilesService.theatreTile(),
      this.currentUser()?.id ?? null,
    ),
  );

  protected readonly identityColor = computed(() => {
    const title = this.title();
    const isDirect = this.isDirect();
    return isDirect ? tuiAutoColor(title) : null;
  });

  protected readonly showLocalScreenPreviewPauseControl = computed(() =>
    showsLocalScreenPreviewPauseControl(
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

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected onToggleFullscreen(): void {
    void this.voiceRoomViewService.toggleFullscreen(this.fullscreenTarget());
  }

  protected onToggleLayout(): void {
    this.voiceRoomActionsService.toggleLayout();
  }

  protected async onHangup(): Promise<void> {
    await this.voiceLeaveService.leaveFromVoiceUi();
  }
}
