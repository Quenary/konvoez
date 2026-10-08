import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { SettingsStore } from '@core/stores/settings.store';
import {
  EMPTY,
  combineLatest,
  distinctUntilChanged,
  fromEvent,
  map,
  merge,
  of,
  startWith,
  Subject,
  switchMap,
  timer,
} from 'rxjs';
import { PeerVideoService } from './peer-video.service';

export const LOCAL_SCREEN_PREVIEW_PAUSE_MS = 5_000;

/**
 * One pause flag for every view of the local screen (grid tile, theatre
 * stage, strip). Producing continues; only the local preview is cleared.
 * Hiding the tab or blurring the window pauses after a delay. Nothing
 * resumes it except {@link resume} or turning the setting off.
 */
@Injectable({ providedIn: 'root' })
export class LocalScreenPreviewService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly settingsStore = inject(SettingsStore);
  private readonly peerVideoService = inject(PeerVideoService);

  private readonly _paused = signal(false);
  private readonly resume$ = new Subject<void>();

  public readonly paused = this._paused.asReadonly();
  public readonly autoPauseWhenHidden =
    this.settingsStore.screenPreviewAutoPauseWhenHidden;

  constructor() {
    effect(() => {
      const enabled = this.autoPauseWhenHidden();
      const track = this.peerVideoService.localScreenTrack();
      if (!enabled || track == null) {
        this._paused.set(false);
      }
    });

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

    const inactive$ = combineLatest([visibilityHidden$, windowFocused$]).pipe(
      map(([hidden, focused]) => hidden || !focused),
      distinctUntilChanged(),
    );

    combineLatest([
      inactive$,
      toObservable(this.autoPauseWhenHidden),
      toObservable(this.peerVideoService.localScreenTrack),
      this.resume$.pipe(startWith(undefined)),
    ])
      .pipe(
        switchMap(([inactive, autoPause, track]) => {
          if (!inactive || !autoPause || track == null) {
            return EMPTY;
          }
          return timer(LOCAL_SCREEN_PREVIEW_PAUSE_MS);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this._paused.set(true);
      });
  }

  public resume(): void {
    this._paused.set(false);
    this.resume$.next();
  }

  public pause(): void {
    this._paused.set(true);
  }

  public setAutoPauseWhenHidden(enabled: boolean): void {
    this.settingsStore.setScreenPreviewAutoPauseWhenHidden(enabled);
  }
}
