import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PeerVideoService } from '@core/services/peer-video.service';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton } from '@taiga-ui/core';
import { TuiBadge } from '@taiga-ui/kit';
import { fromEvent } from 'rxjs';

const PREVIEW_PAUSE_MS = 5_000;

/**
 * Floating bottom-left self screen-share preview (Discord-like PiP).
 * Pausing only affects local preview rendering — produce continues.
 */
@Component({
  selector: 'app-screen-share-pip',
  imports: [TuiButton, TuiBadge, TranslatePipe],
  templateUrl: './screen-share-pip.component.html',
  styleUrl: './screen-share-pip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenSharePipComponent implements OnDestroy {
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly videoEl =
    viewChild<ElementRef<HTMLVideoElement>>('previewEl');

  private pauseTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly track = this.peerVideoService.localScreenTrack;
  protected readonly visible = computed(() => this.track() !== null);
  protected readonly previewPaused = signal(false);
  protected readonly tabHidden = signal(
    typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );

  constructor() {
    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const hidden = document.visibilityState === 'hidden';
        this.tabHidden.set(hidden);
        if (hidden) {
          this.schedulePause();
        } else {
          this.cancelPauseTimer();
          this.resumePreview();
        }
      });

    effect(() => {
      const track = this.track();
      const el = this.videoEl()?.nativeElement;
      if (!track) {
        this.cancelPauseTimer();
        this.previewPaused.set(false);
        this.detachPreview();
        return;
      }
      if (this.previewPaused() || !el) {
        if (this.previewPaused()) {
          this.detachPreview();
        }
        return;
      }
      this.attachPreview(track);
    });
  }

  public ngOnDestroy(): void {
    this.cancelPauseTimer();
    this.detachPreview();
  }

  protected onExtendPreview(): void {
    this.resumePreview();
    if (this.tabHidden()) {
      this.schedulePause();
    }
  }

  private schedulePause(): void {
    this.cancelPauseTimer();
    if (!this.track()) {
      return;
    }
    this.pauseTimer = setTimeout(() => {
      this.pauseTimer = null;
      if (document.visibilityState === 'hidden' && this.track()) {
        this.previewPaused.set(true);
      }
    }, PREVIEW_PAUSE_MS);
  }

  private cancelPauseTimer(): void {
    if (this.pauseTimer !== null) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
  }

  private resumePreview(): void {
    this.previewPaused.set(false);
  }

  private attachPreview(track: MediaStreamTrack): void {
    const el = this.videoEl()?.nativeElement;
    if (!el) {
      return;
    }
    const stream = el.srcObject;
    if (stream instanceof MediaStream && stream.getVideoTracks()[0] === track) {
      void el.play()?.catch(() => undefined);
      return;
    }
    el.srcObject = new MediaStream([track]);
    void el.play()?.catch(() => undefined);
  }

  private detachPreview(): void {
    const el = this.videoEl()?.nativeElement;
    if (!el) {
      return;
    }
    try {
      el.pause();
    } catch {
      // jsdom may not implement HTMLMediaElement.pause
    }
    el.srcObject = null;
  }
}
