import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  debounceTime,
  filter,
  fromEvent,
  map,
  merge,
  Subject,
  tap,
} from 'rxjs';

/** Collapses the burst of visibilitychange / pageshow / online into one resume. */
export const RESUME_DEBOUNCE_MS = 500;

export interface IAppResume {
  /** Time spent hidden, 0 when the app was not hidden (e.g. only `online`). */
  sleptMs: number;
}

/**
 * Single source of "the app is back" signals: tab visible again, page restored
 * (incl. bfcache), network back online.
 */
@Injectable({ providedIn: 'root' })
export class AppResumeService {
  private readonly document = inject(DOCUMENT);
  private readonly resumeSubject = new Subject<IAppResume>();
  private hiddenAt: number | null = null;
  private resumedAt: number | null = null;

  public readonly resume$ = this.resumeSubject.asObservable();

  constructor() {
    const win = this.document.defaultView;
    if (!win) {
      return;
    }

    merge(
      fromEvent(this.document, 'visibilitychange').pipe(
        filter(() => this.document.visibilityState === 'hidden'),
      ),
      fromEvent(win, 'pagehide'),
    )
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.hiddenAt ??= Date.now();
      });

    merge(
      fromEvent(this.document, 'visibilitychange').pipe(
        filter(() => this.document.visibilityState === 'visible'),
      ),
      fromEvent<PageTransitionEvent>(win, 'pageshow').pipe(
        filter((event) => event.persisted),
      ),
      fromEvent(win, 'online'),
    )
      .pipe(
        tap(() => {
          this.resumedAt ??= Date.now();
        }),
        debounceTime(RESUME_DEBOUNCE_MS),
        map(() => {
          const sleptMs =
            this.hiddenAt === null || this.resumedAt === null
              ? 0
              : Math.max(0, this.resumedAt - this.hiddenAt);
          this.hiddenAt = null;
          this.resumedAt = null;
          return { sleptMs };
        }),
        takeUntilDestroyed(),
      )
      .subscribe((resume) => {
        this.resumeSubject.next(resume);
      });
  }
}
