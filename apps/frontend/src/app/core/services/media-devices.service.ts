import { Injectable } from '@angular/core';
import {
  EMPTY,
  Observable,
  debounceTime,
  defer,
  fromEvent,
  map,
  share,
} from 'rxjs';
import { isDisplayMediaAudioConstraintsAbortError } from '@shared/functions/display-media-error.utils';

/** Debounce for bursts of `devicechange` (one plug often fires several events). */
export const DEVICE_CHANGE_DEBOUNCE_MS = 500;

/**
 * Wrapper for navigator media devices api.
 * Methods check the availability of the api, rejects if not.
 */
@Injectable({
  providedIn: 'root',
})
export class MediaDevicesService {
  /**
   * Debounced `devicechange` from `navigator.mediaDevices`. Single shared listener:
   * added on the first subscriber and removed when the last one unsubscribes.
   */
  public readonly deviceChange$: Observable<void> = defer(() => {
    const mediaDevices = navigator?.mediaDevices;
    if (typeof mediaDevices?.addEventListener !== 'function') {
      return EMPTY;
    }
    return fromEvent(mediaDevices, 'devicechange');
  }).pipe(
    debounceTime(DEVICE_CHANGE_DEBOUNCE_MS),
    map((): void => undefined),
    share(),
  );

  isDisplayMediaSupported(): boolean {
    return typeof navigator?.mediaDevices?.getDisplayMedia === 'function';
  }

  getDisplayMedia(options?: DisplayMediaStreamOptions): Promise<MediaStream> {
    if (!this.isDisplayMediaSupported()) {
      return Promise.reject(
        new Error('Screen sharing is not supported in this browser'),
      );
    }

    const hasAudioRequested = Boolean(options?.audio);

    return navigator.mediaDevices.getDisplayMedia(options).catch((error) => {
      // On platforms where system audio capture is unsupported, restricted, or failing
      // (e.g. Windows desktop wrapper where loopback audio is not provided and Chromium
      // throws AbortError: Invalid capture constraints), fall back to capturing screen video
      // without audio so the user can still share their screen.
      //
      // Only retry on AbortError with "capture constraints" in the message. Other errors
      // (including user cancellation / NotAllowedError or desktop picker cancellation)
      // must reject immediately without retrying getDisplayMedia.
      if (
        !hasAudioRequested ||
        !isDisplayMediaAudioConstraintsAbortError(error)
      ) {
        return Promise.reject(error);
      }

      return navigator.mediaDevices.getDisplayMedia({
        ...options,
        audio: false,
      });
    });
  }

  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (typeof navigator?.mediaDevices?.getUserMedia === 'function') {
      return navigator.mediaDevices.getUserMedia(constraints);
    }
    return Promise.reject();
  }

  enumerateDevices(): Promise<MediaDeviceInfo[]> {
    if (typeof navigator?.mediaDevices?.enumerateDevices === 'function') {
      return navigator.mediaDevices.enumerateDevices();
    }
    return Promise.reject();
  }
}
