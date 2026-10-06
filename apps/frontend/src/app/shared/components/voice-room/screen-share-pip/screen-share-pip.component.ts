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
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { PeerVideoService } from '@core/services/peer-video.service';
import { SettingsStore } from '@features/settings/settings.store';
import { TranslatePipe } from '@ngx-translate/core';
import { TuiButton, TuiLabel } from '@taiga-ui/core';
import { TuiCheckbox } from '@taiga-ui/core/components/checkbox';
import {
  combineLatest,
  distinctUntilChanged,
  fromEvent,
  map,
  merge,
  of,
  switchMap,
  timer,
} from 'rxjs';

const PREVIEW_PAUSE_MS = 5_000;

/**
 * Floating bottom-left self screen-share preview (Discord-like PiP).
 * Pausing only affects local preview rendering — produce continues.
 */
@Component({
  selector: 'app-screen-share-pip',
  imports: [FormsModule, TuiButton, TuiCheckbox, TuiLabel, TranslatePipe],
  templateUrl: './screen-share-pip.component.html',
  styleUrl: './screen-share-pip.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScreenSharePipComponent implements OnDestroy {
  private readonly peerVideoService = inject(PeerVideoService);
  private readonly settingsStore = inject(SettingsStore);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly track = this.peerVideoService.localScreenTrack;
  protected readonly visible = computed(() => this.track() !== null);
  protected readonly previewPaused = signal(false);
  protected readonly autoPauseWhenHidden =
    this.settingsStore.screenPreviewAutoPauseWhenHidden;

  private readonly videoEl =
    viewChild<ElementRef<HTMLVideoElement>>('previewEl');

  constructor() {
    const visibilityHidden$ = merge(
      fromEvent(document, 'visibilitychange'),
      of(null),
    ).pipe(
      map(() => document.visibilityState === 'hidden'),
      distinctUntilChanged(),
    );

    const windowFocused$ = merge(
      fromEvent(window, 'focus').pipe(map(() => true)),
      fromEvent(window, 'blur').pipe(map(() => false)),
      of(typeof document !== 'undefined' ? document.hasFocus() : true),
    ).pipe(distinctUntilChanged());

    const previewContextInactive$ = combineLatest([
      visibilityHidden$,
      windowFocused$,
    ]).pipe(
      map(([hidden, focused]) => hidden || !focused),
      distinctUntilChanged(),
    );

    combineLatest([
      previewContextInactive$,
      toObservable(this.autoPauseWhenHidden),
      toObservable(this.track),
    ])
      .pipe(
        switchMap(([inactive, autoPause, track]) => {
          if (!inactive || !autoPause || !track) {
            return of(null);
          }
          return timer(PREVIEW_PAUSE_MS);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        if (
          this.isPreviewContextInactive() &&
          this.track() &&
          this.autoPauseWhenHidden()
        ) {
          this.previewPaused.set(true);
        }
      });

    effect(() => {
      const track = this.track();
      const paused = this.previewPaused();
      const el = this.videoEl()?.nativeElement;

      if (!track) {
        this.previewPaused.set(false);
        this.detachPreview();
        return;
      }

      if (paused || !el) {
        if (paused) {
          this.detachPreview();
        }
        return;
      }
      this.attachPreview(track);
    });
  }

  public ngOnDestroy(): void {
    this.detachPreview();
  }

  protected onResumePreview(): void {
    this.previewPaused.set(false);
  }

  protected onAutoPauseWhenHiddenChange(enabled: boolean): void {
    this.settingsStore.setScreenPreviewAutoPauseWhenHidden(enabled);
    if (!enabled) {
      this.previewPaused.set(false);
    }
  }

  private isPreviewContextInactive(): boolean {
    return document.visibilityState === 'hidden' || !document.hasFocus();
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
