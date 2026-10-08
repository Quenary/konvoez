import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@features/auth/auth.selectors';
import { LocalScreenPreviewService } from '@core/services/local-screen-preview.service';
import { preferTheatreStripRight } from '../voice-peers-layout';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomTilesService } from '../voice-room-tiles.service';
import { VoiceRoomTileComponent } from '../voice-room-tile/voice-room-tile.component';
import { VoiceRoomTileMiniComponent } from '../voice-room-tile-mini/voice-room-tile-mini.component';
import { VideoTrackDirective } from '@shared/directives/video-track.directive';
import type { TVoiceRoomTile } from '../voice-room-tiles';

@Component({
  selector: 'app-voice-room-theatre',
  imports: [
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
  private readonly voiceRoomTilesService = inject(VoiceRoomTilesService);
  private readonly localScreenPreviewService = inject(
    LocalScreenPreviewService,
  );

  private readonly currentUser = this.store.selectSignal(selectCurrentUser);

  protected readonly focusTile = this.voiceRoomTilesService.theatreTile;
  protected readonly stripTiles = this.voiceRoomTilesService.tiles;

  protected readonly stripRight = signal(false);

  private streamWidth = 16;
  private streamHeight = 9;

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

  protected onStripTileClick(tile: TVoiceRoomTile): void {
    if (this.focusTile()?.key === tile.key) {
      return;
    }
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
