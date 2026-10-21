import { Injectable, Injector, OnDestroy, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  DEFAULT_STREAM_FPS,
  DEFAULT_STREAM_HEIGHT,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import { SettingsStore } from '@core/stores/settings.store';
import { Observable, Subject } from 'rxjs';
import { resolveMediaDevice } from '@shared/functions/media-device-priority.function';
import { MediaDevicesService } from './media-devices.service';

/**
 * Local webcam capture with height/FPS constraints from local settings.
 */
@Injectable({ providedIn: 'root' })
export class CameraService implements OnDestroy {
  private readonly injector = inject(Injector);
  private readonly mediaDevicesService = inject(MediaDevicesService);

  /** Lazy: SettingsStore → AUDIO_DEVICE_HANDLER → VoiceSessionService (cycle if eager). */
  private get settingsStore(): InstanceType<typeof SettingsStore> {
    return this.injector.get(SettingsStore);
  }

  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private readonly deviceChangedSubject = new Subject<void>();
  /**
   * The camera that should be used (user choice by id/label, else the first camera)
   * differs from the live one, or none is left. Capture stays live; the session
   * decides whether to switch the producer track or stop the camera.
   */
  public readonly deviceChanged$: Observable<void> =
    this.deviceChangedSubject.asObservable();

  constructor() {
    this.mediaDevicesService.deviceChange$
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.handleDeviceChange());
  }

  ngOnDestroy(): void {
    this.deviceChangedSubject.complete();
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
    const preferred =
      options?.device !== undefined
        ? options.device
        : this.settingsStore.videoInput();
    const devices = await this.mediaDevicesService
      .enumerateDevices()
      .catch((): MediaDeviceInfo[] => []);
    const device =
      resolveMediaDevice(devices, 'videoinput', preferred) ?? preferred;

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
    this.track = track;
    track.addEventListener('ended', () => {
      if (this.track === track) {
        this.stream = null;
        this.track = null;
      }
    });
    return track;
  }

  public release(): void {
    const track = this.track;
    this.track = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    } else if (track && track.readyState !== 'ended') {
      track.stop();
    }
  }

  private async handleDeviceChange(): Promise<void> {
    const current = this.track;
    if (!current || current.readyState !== 'live') {
      return;
    }
    const devices = await this.mediaDevicesService
      .enumerateDevices()
      .catch((): MediaDeviceInfo[] => []);
    const desired = resolveMediaDevice(
      devices,
      'videoinput',
      this.settingsStore.videoInput(),
    );
    if (this.track !== current) {
      return;
    }
    if (desired && desired.deviceId === current.getSettings?.().deviceId) {
      return;
    }
    this.deviceChangedSubject.next();
  }
}
