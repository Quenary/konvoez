import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { IUser } from '@konvoez/shared';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { TranslatePipe } from '@ngx-translate/core';
import {
  TuiButton,
  TuiDropdown,
  TuiHint,
  TuiLabel,
  TuiSlider,
} from '@taiga-ui/core';
import { preferTheatreStripRight } from '../voice-peers-layout';
import { fromEvent } from 'rxjs';

@Component({
  selector: 'app-voice-theatre',
  imports: [
    FormsModule,
    TuiButton,
    TuiDropdown,
    TuiHint,
    TuiLabel,
    TuiSlider,
    TranslatePipe,
  ],
  templateUrl: './voice-theatre.component.html',
  styleUrl: './voice-theatre.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoiceTheatreComponent {
  private readonly voiceRoomStore = inject(VoiceRoomStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);

  public readonly focusPeer = input.required<IUser>();
  public readonly videoTrack = input<MediaStreamTrack | null>(null);
  public readonly stripPeers = input.required<readonly IUser[]>();
  public readonly watchingByPeerId =
    input.required<ReadonlyMap<number, boolean>>();
  public readonly screenLiveByPeerId =
    input.required<ReadonlyMap<number, boolean>>();

  public readonly closeTheatre = output<void>();
  public readonly focusPeerId = output<number>();
  public readonly stopWatch = output<void>();

  private readonly stageEl = viewChild<ElementRef<HTMLElement>>('stageEl');
  private readonly videoEl = viewChild<ElementRef<HTMLVideoElement>>('videoEl');

  protected readonly stripRight = signal(false);
  protected readonly isFullscreen = signal(false);
  protected readonly overlayVisible = signal(false);

  private streamWidth = 16;
  private streamHeight = 9;
  private hideOverlayTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly screenVolume = computed(() => {
    const levels = this.voiceRoomStore.peerScreenGainLevels();
    const gain = levels[this.focusPeer().id] ?? 1;
    return Math.round(gain * 100);
  });

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

    fromEvent(document, 'fullscreenchange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.isFullscreen.set(Boolean(document.fullscreenElement));
      });

    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((event) => {
        if (event.key === 'Escape' && !document.fullscreenElement) {
          this.closeTheatre.emit();
        }
      });

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
    this.overlayVisible.set(true);
    if (this.hideOverlayTimer) {
      clearTimeout(this.hideOverlayTimer);
    }
    this.hideOverlayTimer = setTimeout(() => {
      this.overlayVisible.set(false);
      this.hideOverlayTimer = null;
    }, 2500);
  }

  protected onStageActivate(): void {
    this.revealOverlay();
  }

  protected onScreenVolumeChange(value: number): void {
    this.voiceRoomStore.setPeerScreenGain(this.focusPeer().id, value / 100);
  }

  protected onStripPeerClick(peerId: number): void {
    if (peerId === this.focusPeer().id) {
      return;
    }
    if (this.watchingByPeerId().get(peerId)) {
      this.focusPeerId.emit(peerId);
    }
  }

  protected async onToggleFullscreen(): Promise<void> {
    const stage = this.stageEl()?.nativeElement;
    if (!stage) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen failed', error);
    }
  }

  protected onCloseClick(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen().finally(() => this.closeTheatre.emit());
      return;
    }
    this.closeTheatre.emit();
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
