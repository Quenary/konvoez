import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { preferTheatreStripRight } from '../voice-peers-layout';
import { VoiceChromeReveal } from '../voice-chrome-reveal';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomTheatreActionsComponent } from '../voice-room-theatre-actions/voice-room-theatre-actions.component';
import { VoiceRoomTileComponent } from '../voice-room-tile/voice-room-tile.component';
import { VoiceRoomTileMiniComponent } from '../voice-room-tile-mini/voice-room-tile-mini.component';
import type { TVoiceRoomTile } from '../voice-room-tiles';

@Component({
  selector: 'app-voice-room-theatre',
  imports: [
    NgTemplateOutlet,
    VoiceRoomTheatreActionsComponent,
    VoiceRoomTileComponent,
    VoiceRoomTileMiniComponent,
  ],
  templateUrl: './voice-room-theatre.component.html',
  styleUrl: './voice-room-theatre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceRoomTheatreComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly voiceRoomViewService = inject(VoiceRoomViewService);

  public readonly focusTile = input<TVoiceRoomTile | null>(null);
  public readonly stripTiles = input.required<readonly TVoiceRoomTile[]>();
  public readonly overlay = input<TemplateRef<void> | null>(null);
  public readonly showLocalChrome = input(false);

  public readonly watchScreen = output<number>();
  public readonly stopWatchScreen = output<number>();

  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  protected readonly stripRight = signal(false);

  private readonly chrome = new VoiceChromeReveal(false);
  private streamWidth = 16;
  private streamHeight = 9;

  protected readonly overlayVisible = computed(() => {
    const showLocal = this.showLocalChrome();
    const local = this.chrome.visible();
    return showLocal && local;
  });

  protected readonly videoTrack = computed(
    () => this.focusTile()?.videoTrack ?? null,
  );

  constructor() {
    effect(() => {
      const el = this.videoEl()?.nativeElement;
      const track = this.videoTrack();
      if (!el) {
        return;
      }
      if (track) {
        const stream = el.srcObject;
        if (
          stream instanceof MediaStream &&
          stream.getVideoTracks()[0] === track
        ) {
          return;
        }
        el.srcObject = new MediaStream([track]);
        void el.play()?.catch(() => undefined);
      } else {
        el.srcObject = null;
      }
    });

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
