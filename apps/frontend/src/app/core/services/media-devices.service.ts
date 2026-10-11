import { Injectable } from '@angular/core';

/**
 * Wrapper for navigator media devices api.
 * Methods check the availability of the api, rejects if not.
 */
@Injectable({
  providedIn: 'root',
})
export class MediaDevicesService {
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
      // If the user explicitly cancelled or denied permission (NotAllowedError),
      // or if audio was not requested, reject immediately without retrying.
      const isPermissionDenied =
        (error as { name?: string } | null | undefined)?.name ===
        'NotAllowedError';

      if (!hasAudioRequested || isPermissionDenied) {
        return Promise.reject(error);
      }

      // On platforms where system audio capture is unsupported, restricted, or failing
      // (e.g. Windows desktop wrapper where loopback audio is not provided and Chromium
      // throws AbortError: Invalid capture constraints), fall back to capturing screen video
      // without audio so the user can still share their screen.
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
