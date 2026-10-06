import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';
import { preferTheatreStripRight } from '../voice-peers-layout';
import { VoiceChromeReveal } from '../voice-chrome-reveal';
import type { TVoiceOverlayContext } from '../voice-overlay-slot.directive';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomTheatreActionsComponent } from '../voice-room-theatre-actions/voice-room-theatre-actions.component';
import { VoiceRoomTileComponent } from '../voice-room-tile/voice-room-tile.component';
import { VoiceRoomTileMiniComponent } from '../voice-room-tile-mini/voice-room-tile-mini.component';
import { VideoTrackDirective } from '@shared/directives/video-track.directive';
import type { TVoiceRoomTile } from '../voice-room-tiles';

@Component({
  selector: 'app-voice-room-theatre',
  imports: [
    NgTemplateOutlet,
    VoiceRoomTheatreActionsComponent,
    VoiceRoomTileComponent,
    VoiceRoomTileMiniComponent,
    VideoTrackDirective,
  ],
  templateUrl: './voice-room-theatre.component.html',
  styleUrl: './voice-room-theatre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomTheatreComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly store = inject(Store);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly localScreenPreviewService = inject(
    LocalScreenPreviewService,
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  public readonly focusTile = input<TVoiceRoomTile | null>(null);
  public readonly stripTiles = input.required<readonly TVoiceRoomTile[]>();
  public readonly overlay = input<TemplateRef<TVoiceOverlayContext> | null>(
    null,
  );
  public readonly showLocalChrome = input(false);

  public readonly watchScreen = output<number>();
  public readonly stopWatchScreen = output<number>();

  protected readonly stripRight = signal(false);

  private readonly chrome = new VoiceChromeReveal(false);
  private streamWidth = 16;
  private streamHeight = 9;

  protected readonly overlayVisible = computed(() => {
    const showLocal = this.showLocalChrome();
    const local = this.chrome.visible();
    return showLocal && local;
  });

  protected readonly videoTrack = computed(() => {
    const tile = this.focusTile();
    const paused = this.localScreenPreviewService.paused();
    const localId = this.currentUser()?.id ?? null;
    if (
      paused &&
      tile?.streamKind === 'screen' &&
      localId != null &&
      tile.peerId === localId
    ) {
      return null;
    }
    return tile?.videoTrack ?? null;
  });

  protected readonly stripItems = computed(() => {
    const paused = this.localScreenPreviewService.paused();
    const localId = this.currentUser()?.id ?? null;
    return this.stripTiles().map((tile) => {
      const previewPaused =
        paused &&
        tile.streamKind === 'screen' &&
        localId != null &&
        tile.peerId === localId;
      return {
        tile,
        videoTrack: previewPaused ? null : tile.videoTrack,
        previewPaused,
      };
    });
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.chrome.destroy());

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.updateStripPlacement());
      ro.observe(this.host.nativeElement);
      this.destroyRef.onDestroy(() => ro.disconnect());
    }
  }

  protected onVideoMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      this.streamWidth = video.videoWidth;
      this.streamHeight = video.videoHeight;
      this.updateStripPlacement();
    }
  }

  protected revealOverlay(): void {
    const showLocal = this.showLocalChrome();
    if (!showLocal) {
      this.voiceRoomViewService.revealChrome();
      return;
    }
    this.chrome.reveal();
  }

  protected onStageActivate(): void {
    this.revealOverlay();
  }

  protected onStripTileClick(tile: TVoiceRoomTile): void {
    if (this.focusTile()?.key === tile.key) {
      return;
    }
    this.voiceRoomViewService.openTheatre(tile.peerId, tile.streamKind);
  }

  protected onStageTileOpen(tile: TVoiceRoomTile): void {
    this.voiceRoomViewService.openTheatre(tile.peerId, tile.streamKind);
  }

  private updateStripPlacement(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    this.stripRight.set(
      preferTheatreStripRight(
        rect.width,
        rect.height,
        this.streamWidth,
        this.streamHeight,
      ),
    );
  }
}
