import { Injectable } from '@angular/core';
import {
  attachmentsMaxPosterSize,
  attachmentsMaxVideoDurationSeconds,
  attachmentsThumbnailMaxSide,
} from '@konvoez/shared';
import {
  Observable,
  catchError,
  defer,
  finalize,
  from,
  fromEvent,
  map,
  of,
  race,
  shareReplay,
  switchMap,
  take,
} from 'rxjs';

const POSTER_TIMEOUT_MS = 5_000;
const POSTER_SLOTS = 2;

export interface IClientVideoPoster {
  readonly poster: File | null;
  readonly videoWidth: number | null;
  readonly videoHeight: number | null;
  readonly durationSeconds: number | null;
  readonly displayWidth: number | null;
  readonly displayHeight: number | null;
}

export function posterSeekSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.min(1, duration / 2);
}

export function posterPixelSize(
  width: number,
  height: number,
): { width: number; height: number } | null {
  if (width < 1 || height < 1) {
    return null;
  }
  const scale = Math.min(
    1,
    attachmentsThumbnailMaxSide / Math.max(width, height),
  );
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

interface IPosterJob {
  readonly result: Observable<IClientVideoPoster | null>;
  readonly abort: AbortController;
}

interface IFrameBitmap {
  readonly poster: File;
  readonly width: number;
  readonly height: number;
}

@Injectable({ providedIn: 'root' })
export class VideoPosterService {
  private readonly jobs = new Map<string, IPosterJob>();
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  capture(localId: string, file: File): Observable<IClientVideoPoster | null> {
    const existing = this.jobs.get(localId);
    if (existing) {
      return existing.result;
    }
    const abort = new AbortController();
    // The composer may unsubscribe before the outgoing message subscribes.
    const result = defer(() =>
      from(this.acquire(abort.signal)).pipe(
        switchMap((acquired) => {
          if (!acquired) {
            return of<IClientVideoPoster | null>(null);
          }
          const timed = abortAfter(abort.signal, POSTER_TIMEOUT_MS);
          return this.grab(file, timed.signal).pipe(
            catchError(() => of<IClientVideoPoster | null>(null)),
            finalize(() => {
              timed.stop();
              this.release();
            }),
          );
        }),
      ),
    ).pipe(shareReplay({ bufferSize: 1, refCount: false }));
    this.jobs.set(localId, { result, abort });
    return result;
  }

  whenReady(localId: string): Observable<IClientVideoPoster | null> {
    return this.jobs.get(localId)?.result ?? of(null);
  }

  dispose(localId: string): void {
    const job = this.jobs.get(localId);
    this.jobs.delete(localId);
    job?.abort.abort();
  }

  private acquire(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) {
      return Promise.resolve(false);
    }
    if (this.active < POSTER_SLOTS) {
      this.active += 1;
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (acquired: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener('abort', onAbort);
        resolve(acquired);
      };
      const waiter = (): void => {
        if (signal.aborted) {
          finish(false);
          this.grantNext();
          return;
        }
        this.active += 1;
        finish(true);
      };
      const onAbort = (): void => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) {
          this.waiters.splice(index, 1);
        }
        finish(false);
      };
      this.waiters.push(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.grantNext();
  }

  private grantNext(): void {
    const next = this.waiters.shift();
    next?.();
  }

  private grab(
    file: File,
    signal: AbortSignal,
  ): Observable<IClientVideoPoster | null> {
    return new Observable((subscriber) => {
      if (signal.aborted) {
        subscriber.next(null);
        subscriber.complete();
        return;
      }
      const video = document.createElement('video');
      const url = URL.createObjectURL(file);
      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) {
          return;
        }
        cleaned = true;
        video.pause();
        video.removeAttribute('src');
        video.load();
        video.remove();
        URL.revokeObjectURL(url);
      };
      const emit = (value: IClientVideoPoster | null): void => {
        cleanup();
        subscriber.next(value);
        subscriber.complete();
      };
      video.muted = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('playsinline', '');
      video.style.position = 'fixed';
      video.style.insetInlineStart = '-10000px';
      video.style.width = '8px';
      video.style.height = '8px';
      video.style.opacity = '0';
      document.body.append(video);
      const events = race(
        fromEvent(video, 'loadedmetadata').pipe(
          take(1),
          switchMap(() => this.drawFrame(video, signal)),
        ),
        fromEvent(video, 'error').pipe(
          take(1),
          map(() => null as IClientVideoPoster | null),
        ),
        abortResult(signal),
      ).pipe(take(1));
      const subscription = events.subscribe({
        next: emit,
        error: () => emit(null),
      });
      video.src = url;
      return () => {
        subscription.unsubscribe();
        cleanup();
      };
    });
  }

  private drawFrame(
    video: HTMLVideoElement,
    signal: AbortSignal,
  ): Observable<IClientVideoPoster | null> {
    const durationSeconds = finiteDuration(video.duration);
    const videoWidth = positive(video.videoWidth);
    const videoHeight = positive(video.videoHeight);
    const seekTo = posterSeekSeconds(video.duration);
    return this.seek(video, seekTo, signal).pipe(
      switchMap((sought) =>
        !sought && seekTo !== 0 ? this.seek(video, 0, signal) : of(sought),
      ),
      switchMap(() => {
        if (signal.aborted) {
          return of(null);
        }
        const captured =
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            ? from(this.paint(video)).pipe(
                switchMap((bitmap) =>
                  bitmap ? of(bitmap) : from(this.playFrame(video, signal)),
                ),
              )
            : from(this.playFrame(video, signal));
        return captured.pipe(
          map((bitmap) =>
            signal.aborted
              ? null
              : {
                  poster: bitmap?.poster ?? null,
                  videoWidth,
                  videoHeight,
                  durationSeconds,
                  displayWidth: bitmap?.width ?? null,
                  displayHeight: bitmap?.height ?? null,
                },
          ),
        );
      }),
    );
  }

  private seek(
    video: HTMLVideoElement,
    seconds: number,
    signal: AbortSignal,
  ): Observable<boolean> {
    return new Observable((subscriber) => {
      if (signal.aborted) {
        subscriber.next(false);
        subscriber.complete();
        return;
      }
      let settled = false;
      const done = (ok: boolean): void => {
        if (settled) {
          return;
        }
        settled = true;
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
        subscriber.next(ok);
        subscriber.complete();
      };
      const onSeeked = (): void => done(true);
      const onError = (): void => done(false);
      const onAbort = (): void => done(false);
      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        video.currentTime = seconds;
      } catch {
        done(false);
      }
      return () => {
        if (settled) {
          return;
        }
        settled = true;
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        signal.removeEventListener('abort', onAbort);
      };
    });
  }

  private async playFrame(
    video: HTMLVideoElement,
    signal: AbortSignal,
  ): Promise<IFrameBitmap | null> {
    if (signal.aborted) {
      return null;
    }
    try {
      await video.play();
    } catch {
      return this.paint(video);
    }
    if (signal.aborted) {
      return null;
    }
    video.pause();
    await nextPresentedFrame(video, signal);
    if (signal.aborted) {
      return null;
    }
    return this.paint(video);
  }

  private async paint(video: HTMLVideoElement): Promise<IFrameBitmap | null> {
    const size = posterPixelSize(video.videoWidth, video.videoHeight);
    if (!size) {
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }
    context.drawImage(video, 0, 0, size.width, size.height);
    const webp = await canvasToBlob(canvas, 'image/webp');
    const blob =
      webp?.type === 'image/webp'
        ? webp
        : await canvasToBlob(canvas, 'image/jpeg');
    if (!blob || (blob.type !== 'image/webp' && blob.type !== 'image/jpeg')) {
      return null;
    }
    if (blob.size > attachmentsMaxPosterSize) {
      return null;
    }
    const type = blob.type;
    const extension = type === 'image/webp' ? 'webp' : 'jpg';
    return {
      poster: new File([blob], `poster.${extension}`, { type }),
      width: size.width,
      height: size.height,
    };
  }
}

function abortResult(signal: AbortSignal): Observable<null> {
  return new Observable((subscriber) => {
    if (signal.aborted) {
      subscriber.next(null);
      subscriber.complete();
      return;
    }
    const onAbort = (): void => {
      subscriber.next(null);
      subscriber.complete();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    return () => signal.removeEventListener('abort', onAbort);
  });
}

function abortAfter(
  parent: AbortSignal,
  ms: number,
): { readonly signal: AbortSignal; readonly stop: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onParent = (): void => controller.abort();
  if (parent.aborted) {
    controller.abort();
  } else {
    parent.addEventListener('abort', onParent, { once: true });
  }
  return {
    signal: controller.signal,
    stop: () => {
      clearTimeout(timer);
      parent.removeEventListener('abort', onParent);
    },
  };
}

function nextPresentedFrame(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    let handle = 0;
    const withCallback = video as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
      cancelVideoFrameCallback?: (handle: number) => void;
    };
    const finish = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const onAbort = (): void => {
      if (handle !== 0) {
        withCallback.cancelVideoFrameCallback?.(handle);
      }
      finish();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (withCallback.requestVideoFrameCallback) {
      handle = withCallback.requestVideoFrameCallback(() => finish());
      return;
    }
    video.addEventListener('timeupdate', () => finish(), { once: true });
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, 0.8);
  });
}

function finiteDuration(duration: number): number | null {
  if (
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > attachmentsMaxVideoDurationSeconds
  ) {
    return null;
  }
  return duration;
}

function positive(value: number): number | null {
  if (!Number.isFinite(value) || value < 1) {
    return null;
  }
  return value;
}
