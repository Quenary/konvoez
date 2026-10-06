import { Injectable, Injector, OnDestroy, inject, signal } from '@angular/core';
import {
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import { SettingsStore } from '@features/settings/settings.store';

/**
 * Local webcam capture with height/FPS constraints from local settings.
 */
@Injectable({ providedIn: 'root' })
export class CameraService implements OnDestroy {
  private readonly injector = inject(Injector);

  /** Lazy: SettingsStore → AUDIO_DEVICE_HANDLER → VoiceSessionService (cycle if eager). */
  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  private stream: MediaStream | null = null;
  private readonly _track = signal<MediaStreamTrack | null>(null);
  public readonly track = this._track.asReadonly();

  private readonly onDeviceChange = (): void => {
    void this.handleDeviceChange();
  };

  constructor() {
    navigator.mediaDevices?.addEventListener?.(
      'devicechange',
      this.onDeviceChange,
    );
  }

  ngOnDestroy(): void {
    navigator.mediaDevices?.removeEventListener?.(
      'devicechange',
      this.onDeviceChange,
    );
    this.release();
  }

  public async getTrack(options?: {
    height?: TStreamHeight;
    fps?: TStreamFps;
    device?: MediaDeviceInfo | null;
  }): Promise<MediaStreamTrack> {
    const height =
      options?.height ??
      this.settingsStore.streamHeight() ??
      DEFAULT_STREAM_HEIGHT;
    const fps =
      options?.fps ?? this.settingsStore.streamFps() ?? DEFAULT_STREAM_FPS;
    const device =
      options?.device !== undefined
        ? options.device
        : this.settingsStore.videoInput();

    this.release();

    if (!navigator?.mediaDevices?.getUserMedia) {
      throw new Error(
        'MediaDevices API is not available (requires HTTPS or localhost)',
      );
    }

    const videoConstraints: MediaTrackConstraints = {
      height: { ideal: height },
      frameRate: { ideal: fps },
      facingMode: 'user',
    };
    if (device?.deviceId) {
      videoConstraints.deviceId = { ideal: device.deviceId };
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints,
    });
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('Camera stream has no video track');
    }

    try {
      track.contentHint = 'motion';
    } catch {
      // contentHint is best-effort
    }

    this.stream = stream;
    this._track.set(track);
    track.addEventListener('ended', () => {
      if (this._track() === track) {
        this.stream = null;
        this._track.set(null);
      }
    });
    return track;
  }

  public release(): void {
    const track = this._track();
    this._track.set(null);
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    } else if (track && track.readyState !== 'ended') {
      track.stop();
    }
  }

  private async handleDeviceChange(): Promise<void> {
    const current = this._track();
    const device = this.settingsStore.videoInput();
    if (!current || !device) {
      return;
    }
    const devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
    const stillPresent = devices.some(
      (item) => item.kind === 'videoinput' && item.deviceId === device.deviceId,
    );
    if (!stillPresent) {
      this.release();
    }
  }
}
