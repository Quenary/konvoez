import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { provideTranslateService } from '@ngx-translate/core';
import { EMPTY } from 'rxjs';
import { StreamCameraPreviewComponent } from './stream-camera-preview.component';
import {
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';

function cameraDevice(deviceId: string, label = deviceId): MediaDeviceInfo {
  return {
    deviceId,
    kind: 'videoinput',
    label,
    groupId: 'g',
  } as MediaDeviceInfo;
}

function requestedDeviceId(constraints: MediaStreamConstraints): string | null {
  const video = constraints.video;
  if (!video || typeof video !== 'object' || !('deviceId' in video)) {
    return null;
  }
  const deviceId = video.deviceId;
  if (typeof deviceId === 'string') {
    return deviceId;
  }
  if (
    deviceId &&
    typeof deviceId === 'object' &&
    'ideal' in deviceId &&
    typeof deviceId.ideal === 'string'
  ) {
    return deviceId.ideal;
  }
  return null;
}

describe('StreamCameraPreviewComponent', () => {
  let fixture: ComponentFixture<StreamCameraPreviewComponent>;
  let component: StreamCameraPreviewComponent;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let enumerateDevices: ReturnType<typeof vi.fn>;

  async function setup(
    cameraInput: MediaDeviceInfo | null = null,
    height: TStreamHeight = 720,
    fps: TStreamFps = 30,
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [StreamCameraPreviewComponent],
      providers: [
        provideTranslateService(),
        {
          provide: MediaDevicesService,
          useValue: {
            getUserMedia,
            enumerateDevices,
            deviceChange$: EMPTY,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamCameraPreviewComponent);
    fixture.componentRef.setInput('height', height);
    fixture.componentRef.setInput('fps', fps);
    fixture.componentRef.setInput('cameraInput', cameraInput);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      const deviceId = requestedDeviceId(constraints) ?? 'cam-default';
      const track = {
        readyState: 'live',
        stop: vi.fn(),
        getSettings: () => ({ deviceId }),
      };
      return {
        getVideoTracks: () => [track],
        getTracks: () => [track],
      };
    });
    enumerateDevices = vi.fn(async () => [
      cameraDevice('cam-default', 'Default camera'),
    ]);
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
  });

  it('selects the stored camera and previews that device', async () => {
    vi.useFakeTimers();
    const stored = cameraDevice('cam-2', 'USB cam');
    enumerateDevices.mockResolvedValue([
      cameraDevice('cam-1', 'Built-in'),
      stored,
    ]);
    await setup(stored);

    await vi.advanceTimersByTimeAsync(200);

    expect(component.camera()?.deviceId).toBe('cam-2');
    expect(component['previewTrack']()?.getSettings().deviceId).toBe('cam-2');
    const video = getUserMedia.mock.calls.at(-1)?.[0].video;
    expect(video).toEqual(
      expect.objectContaining({
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        deviceId: { ideal: 'cam-2' },
      }),
    );
    expect(video).not.toHaveProperty('facingMode');
  });

  it('falls back to the first camera when the stored one is gone', async () => {
    vi.useFakeTimers();
    enumerateDevices.mockResolvedValue([
      cameraDevice('cam-a', 'Built-in'),
      cameraDevice('cam-b', 'USB cam'),
    ]);
    await setup(cameraDevice('missing', 'Old cam'));

    await vi.advanceTimersByTimeAsync(200);

    expect(component.camera()?.deviceId).toBe('cam-a');
    expect(component['previewTrack']()?.getSettings().deviceId).toBe('cam-a');
  });

  it('restarts the preview on the camera the user picks', async () => {
    vi.useFakeTimers();
    const first = cameraDevice('cam-1', 'Built-in');
    const second = cameraDevice('cam-2', 'USB cam');
    enumerateDevices.mockResolvedValue([first, second]);
    await setup(first);
    await vi.advanceTimersByTimeAsync(200);

    component['onCameraChange'](second);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(200);

    expect(component.camera()?.deviceId).toBe('cam-2');
    expect(component['previewTrack']()?.getSettings().deviceId).toBe('cam-2');
    const video = getUserMedia.mock.calls.at(-1)?.[0].video;
    expect(video.deviceId).toEqual({ ideal: 'cam-2' });
    expect(video.facingMode).toBeUndefined();
  });

  it('stops the preview when the component is destroyed', async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    getUserMedia.mockImplementation(
      async (constraints: MediaStreamConstraints) => {
        const deviceId = requestedDeviceId(constraints) ?? 'cam-default';
        const track = {
          readyState: 'live',
          stop,
          getSettings: () => ({ deviceId }),
        };
        return {
          getVideoTracks: () => [track],
          getTracks: () => [track],
        };
      },
    );
    await setup();
    await vi.advanceTimersByTimeAsync(200);
    expect(component['previewTrack']()).not.toBeNull();

    fixture.destroy();

    expect(stop).toHaveBeenCalled();
  });
});
