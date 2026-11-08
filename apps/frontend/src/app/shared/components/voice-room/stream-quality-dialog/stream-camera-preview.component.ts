import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { resolveMediaDevice } from '@shared/functions/media-device-priority.function';
import {
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import { TuiDropdown, TuiLabel, TuiTextfield } from '@taiga-ui/core';
import { TuiChevron, TuiDataListWrapper, TuiSelect } from '@taiga-ui/kit';

const PREVIEW_DEBOUNCE_MS = 200;

type TPreviewInput = {
  height: TStreamHeight;
  fps: TStreamFps;
  deviceId: string | null;
};

type TPreviewErrorKey =
  'CALL.STREAM_CAMERA_PREVIEW_FAILED' | 'CALL.STREAM_NO_CAMERA';

function stopMediaStream(stream: MediaStream): void {
  for (const track of stream.getTracks()) {
    if (track.readyState !== 'ended') {
      track.stop();
    }
  }
}

/**
 * Camera picker and live preview for the start-camera dialog.
 * The preview stream is released when the component is destroyed.
 */
@Component({
  selector: 'app-stream-camera-preview',
  imports: [
    FormsModule,
    TranslatePipe,
    TuiLabel,
    TuiSelect,
    TuiTextfield,
    TuiDropdown,
    TuiDataListWrapper,
    TuiChevron,
  ],
  templateUrl: './stream-camera-preview.component.html',
  styleUrl: './stream-camera-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StreamCameraPreviewComponent {
  private readonly mediaDevicesService = inject(MediaDevicesService);
  private readonly translateService = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  readonly height = input.required<TStreamHeight>();
  readonly fps = input.required<TStreamFps>();
  readonly cameraInput = input<MediaDeviceInfo | null>(null);
  readonly cameraChange = output<MediaDeviceInfo | null>();
  readonly blockedChange = output<boolean>();

  readonly camera = signal<MediaDeviceInfo | null>(null);

  protected readonly cameras = signal<MediaDeviceInfo[]>([]);
  protected readonly previewTrack = signal<MediaStreamTrack | null>(null);
  protected readonly previewError = signal<TPreviewErrorKey | null>(null);
  protected readonly stringifyCamera = (camera: MediaDeviceInfo): string =>
    camera.label || this.translateService.instant('CALL.STREAM_CAMERA_UNNAMED');
  protected readonly matchCamera = (
    left: MediaDeviceInfo,
    right: MediaDeviceInfo,
  ): boolean => left.deviceId === right.deviceId;
  private readonly blocked = computed(() => {
    const camera = this.camera();
    const error = this.previewError();
    return camera == null || error != null;
  });

  private readonly previewVideo =
    viewChild<ElementRef<HTMLVideoElement>>('preview');
  private previewStream: MediaStream | null = null;
  private previewDeviceId: string | null | undefined = undefined;
  private previewHeight: TStreamHeight | null = null;
  private previewFps: TStreamFps | null = null;
  private failedPreview: TPreviewInput | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | undefined;
  private previewGeneration = 0;
  private closed = false;

  constructor() {
    this.destroyRef.onDestroy(() => this.release());
    this.mediaDevicesService.deviceChange$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.refreshCameras();
      });
    effect(() => {
      const height = this.height();
      const fps = this.fps();
      const storedId = this.cameraInput()?.deviceId ?? null;
      const selectedId = this.camera()?.deviceId ?? null;
      const track = this.previewTrack();
      const deviceId = selectedId ?? storedId;
      if (
        track?.readyState === 'live' &&
        this.previewDeviceId === deviceId &&
        this.previewHeight === height &&
        this.previewFps === fps
      ) {
        return;
      }
      if (this.isSamePreviewFailure(height, fps, deviceId)) {
        return;
      }
      this.schedulePreview({ height, fps, deviceId });
    });
    effect(() => {
      const camera = this.camera();
      const blocked = this.blocked();
      this.cameraChange.emit(camera);
      this.blockedChange.emit(blocked);
    });
    effect(() => {
      const videoRef = this.previewVideo();
      const track = this.previewTrack();
      const video = videoRef?.nativeElement;
      if (!video) {
        return;
      }
      const stream = track ? this.previewStream : null;
      if (video.srcObject !== stream) {
        video.srcObject = stream;
      }
      if (!track) {
        return;
      }
      void video.play()?.catch(() => undefined);
    });
  }

  protected onCameraChange(camera: MediaDeviceInfo | null): void {
    if (!camera || camera.deviceId === this.camera()?.deviceId) {
      return;
    }
    this.previewError.set(null);
    this.failedPreview = null;
    this.camera.set(camera);
  }

  private release(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.previewGeneration += 1;
    this.clearPreviewTimer();
    this.stopPreview();
  }

  private isSamePreviewFailure(
    height: TStreamHeight,
    fps: TStreamFps,
    deviceId: string | null,
  ): boolean {
    const failed = this.failedPreview;
    return (
      failed != null &&
      failed.height === height &&
      failed.fps === fps &&
      failed.deviceId === deviceId
    );
  }

  private schedulePreview(request: TPreviewInput): void {
    if (this.closed) {
      return;
    }
    this.clearPreviewTimer();
    const generation = ++this.previewGeneration;
    this.previewTimer = setTimeout(() => {
      this.previewTimer = undefined;
      void this.applyPreview(request, generation);
    }, PREVIEW_DEBOUNCE_MS);
  }

  private async applyPreview(
    request: TPreviewInput,
    generation: number,
  ): Promise<void> {
    let deviceId = request.deviceId;
    let released = false;
    while (generation === this.previewGeneration && !this.closed) {
      if (!released) {
        this.releasePreviewStream();
        released = true;
      }
      let stream: MediaStream;
      try {
        stream = await this.mediaDevicesService.getUserMedia({
          audio: false,
          video: this.previewConstraints({ ...request, deviceId }),
        });
      } catch {
        if (generation !== this.previewGeneration || this.closed) {
          return;
        }
        const devices = await this.listCameras();
        if (generation !== this.previewGeneration || this.closed) {
          return;
        }
        this.cameras.set(devices);
        const selected = this.resolveCamera(devices, deviceId);
        this.failPreview(
          { ...request, deviceId },
          'CALL.STREAM_CAMERA_PREVIEW_FAILED',
        );
        if (selected && selected.deviceId !== this.camera()?.deviceId) {
          this.setCamera(selected);
        }
        return;
      }

      if (generation !== this.previewGeneration || this.closed) {
        stopMediaStream(stream);
        return;
      }

      const devices = await this.listCameras();
      if (generation !== this.previewGeneration || this.closed) {
        stopMediaStream(stream);
        return;
      }
      this.cameras.set(devices);

      const selected = this.resolveCamera(devices, deviceId);
      const track = stream.getVideoTracks()[0];
      if (!selected || !track) {
        stopMediaStream(stream);
        this.failPreview(
          { ...request, deviceId },
          selected
            ? 'CALL.STREAM_CAMERA_PREVIEW_FAILED'
            : 'CALL.STREAM_NO_CAMERA',
        );
        if (this.camera()) {
          this.setCamera(null);
        }
        return;
      }

      const openedId = track.getSettings?.().deviceId ?? '';
      if (openedId && selected.deviceId && openedId !== selected.deviceId) {
        stopMediaStream(stream);
        if (deviceId === selected.deviceId) {
          this.failPreview(
            { ...request, deviceId: selected.deviceId },
            'CALL.STREAM_CAMERA_PREVIEW_FAILED',
          );
          this.setCamera(selected);
          return;
        }
        deviceId = selected.deviceId;
        continue;
      }

      this.replacePreview(stream);
      this.previewHeight = request.height;
      this.previewFps = request.fps;
      this.previewDeviceId = selected.deviceId || null;
      this.failedPreview = null;
      this.previewError.set(null);
      this.setCamera(selected);
      return;
    }
  }

  private failPreview(request: TPreviewInput, key: TPreviewErrorKey): void {
    this.failedPreview = request;
    this.previewDeviceId = undefined;
    this.previewHeight = null;
    this.previewFps = null;
    this.stopPreview();
    this.previewError.set(key);
  }

  private previewConstraints(request: TPreviewInput): MediaTrackConstraints {
    const constraints: MediaTrackConstraints = {
      height: { ideal: request.height },
      frameRate: { ideal: request.fps },
    };
    if (request.deviceId) {
      constraints.deviceId = { ideal: request.deviceId };
    }
    return constraints;
  }

  private resolveCamera(
    devices: readonly MediaDeviceInfo[],
    deviceId: string | null,
  ): MediaDeviceInfo | null {
    const current = this.camera();
    const stored = this.cameraInput();
    const preferred = deviceId
      ? {
          deviceId,
          label: current?.label ?? stored?.label,
        }
      : (current ?? stored);
    return resolveMediaDevice(devices, 'videoinput', preferred);
  }

  private async listCameras(): Promise<MediaDeviceInfo[]> {
    try {
      const devices = await this.mediaDevicesService.enumerateDevices();
      return devices.filter(
        (device) => device.kind === 'videoinput' && !!device.deviceId,
      );
    } catch {
      return [];
    }
  }

  private async refreshCameras(): Promise<void> {
    if (this.closed) {
      return;
    }
    const devices = await this.listCameras();
    if (this.closed) {
      return;
    }
    this.cameras.set(devices);
    const current = this.camera();
    if (!current) {
      return;
    }
    const next = resolveMediaDevice(devices, 'videoinput', current);
    if (!next) {
      this.failPreview(
        {
          height: this.height(),
          fps: this.fps(),
          deviceId: null,
        },
        'CALL.STREAM_NO_CAMERA',
      );
      this.setCamera(null);
      return;
    }
    if (next.deviceId !== current.deviceId) {
      this.previewError.set(null);
      this.failedPreview = null;
      this.setCamera(next);
    }
  }

  private setCamera(camera: MediaDeviceInfo | null): void {
    const current = this.camera();
    if (
      current?.deviceId === camera?.deviceId &&
      current?.label === camera?.label
    ) {
      return;
    }
    this.camera.set(camera);
  }

  private releasePreviewStream(): void {
    const stream = this.previewStream;
    this.previewStream = null;
    if (stream) {
      stopMediaStream(stream);
    }
  }

  private replacePreview(stream: MediaStream): void {
    this.releasePreviewStream();
    this.previewStream = stream;
    this.previewTrack.set(stream.getVideoTracks()[0] ?? null);
  }

  private stopPreview(): void {
    this.releasePreviewStream();
    this.previewTrack.set(null);
  }

  private clearPreviewTimer(): void {
    if (this.previewTimer == null) {
      return;
    }
    clearTimeout(this.previewTimer);
    this.previewTimer = undefined;
  }
}
