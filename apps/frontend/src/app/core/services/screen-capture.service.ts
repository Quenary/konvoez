import { Injectable, Injector, OnDestroy, inject } from '@angular/core';
import {
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import { SettingsStore } from '@features/settings/settings.store';

export type TScreenCaptureResult = {
  videoTrack: MediaStreamTrack;
  audioTrack: MediaStreamTrack | null;
};

/**
 * getDisplayMedia capture for screen share. SettingsStore is resolved lazily
 * to avoid VoiceSessionService ↔ SettingsStore DI cycles.
 */
@Injectable({ providedIn: 'root' })
export class ScreenCaptureService implements OnDestroy {
  private readonly injector = inject(Injector);

  /** Lazy: SettingsStore → AUDIO_DEVICE_HANDLER → VoiceSessionService. */
  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  private stream: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private audioTrack: MediaStreamTrack | null = null;

  public static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getDisplayMedia
    );
  }

  ngOnDestroy(): void {
    this.release();
  }

  public async getTracks(options?: {
    height?: TStreamHeight;
    fps?: TStreamFps;
  }): Promise<TScreenCaptureResult> {
    if (!ScreenCaptureService.isSupported()) {
      throw new Error('Screen sharing is not supported in this browser');
    }

    const height =
      options?.height ??
      this.settingsStore.screenHeight() ??
      DEFAULT_STREAM_HEIGHT;
    const fps =
      options?.fps ?? this.settingsStore.screenFps() ?? DEFAULT_STREAM_FPS;

    this.release();

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        height: { ideal: height },
        frameRate: { ideal: fps },
      },
      audio: true,
    });

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Screen share has no video track');
    }

    const contentHint = fps >= 60 ? 'motion' : 'detail';
    try {
      videoTrack.contentHint = contentHint;
    } catch {
      // best-effort
    }

    const audioTrack = stream.getAudioTracks()[0] ?? null;

    this.stream = stream;
    this.videoTrack = videoTrack;
    this.audioTrack = audioTrack;

    videoTrack.addEventListener('ended', () => {
      if (this.videoTrack === videoTrack) {
        this.release();
      }
    });

    return { videoTrack, audioTrack };
  }

  public release(): void {
    const video = this.videoTrack;
    const audio = this.audioTrack;
    this.videoTrack = null;
    this.audioTrack = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    } else {
      if (video && video.readyState !== 'ended') {
        video.stop();
      }
      if (audio && audio.readyState !== 'ended') {
        audio.stop();
      }
    }
  }
}
