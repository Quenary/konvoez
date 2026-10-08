import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
} from '@angular/core';
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
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);
  private readonly voiceRoomTilesService = inject(VoiceRoomTilesService);

  protected readonly focusTile = this.voiceRoomTilesService.theatreTile;
  protected readonly stripTiles = this.voiceRoomTilesService.tiles;

  protected readonly stripRight = signal(false);

  private streamWidth = 16;
  private streamHeight = 9;

  protected readonly videoTrack = computed(() => {
    const tile = this.focusTile();
    if (tile?.previewPaused) {
      return null;
    }
    return tile?.videoTrack ?? null;
  });

  protected readonly stripItems = computed(() => {
    return this.stripTiles().map((tile) => ({
      tile,
      videoTrack: tile.previewPaused ? null : tile.videoTrack,
      previewPaused: tile.previewPaused,
    }));
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
