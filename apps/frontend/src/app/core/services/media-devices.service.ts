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
      // On platforms where system audio capture is unsupported, restricted, or failing
      // (e.g. Windows desktop wrapper where loopback audio is not provided and Chromium
      // throws AbortError: Invalid capture constraints), fall back to capturing screen video
      // without audio so the user can still share their screen.
      //
      // Only retry on AbortError with "capture constraints" in the message. Other errors
      // (including user cancellation / NotAllowedError or desktop picker cancellation)
      // must reject immediately without retrying getDisplayMedia.
      if (!hasAudioRequested || !this.isCaptureConstraintsAbortError(error)) {
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

  private isCaptureConstraintsAbortError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const name =
      'name' in error && typeof error.name === 'string' ? error.name : '';
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : '';

    return (
      name === 'AbortError' &&
      message.toLowerCase().includes('capture constraints')
    );
  }
}
