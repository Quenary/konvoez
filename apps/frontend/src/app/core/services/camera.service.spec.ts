import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { SettingsStore } from '@features/settings/settings.store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraService } from './camera.service';

describe('CameraService', () => {
  let service: CameraService;
  let enumerateDevices: ReturnType<typeof vi.fn>;
  const videoInput = signal<MediaDeviceInfo | null>({
    deviceId: 'cam-1',
    kind: 'videoinput',
  } as MediaDeviceInfo);

  beforeEach(() => {
    enumerateDevices = vi.fn().mockResolvedValue([]);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        enumerateDevices,
      },
    });
    videoInput.set({
      deviceId: 'cam-1',
      kind: 'videoinput',
    } as MediaDeviceInfo);

    TestBed.configureTestingModule({
      providers: [
        CameraService,
        {
          provide: SettingsStore,
          useValue: {
            videoInput: videoInput.asReadonly(),
          },
        },
      ],
    });
    service = TestBed.inject(CameraService);
  });

  it('reports a missing camera without stopping the live track', async () => {
    const track = { readyState: 'live' } as MediaStreamTrack;
    service['track'] = track;
    const release = vi.spyOn(service, 'release');
    const lost = vi.fn();
    service.deviceLost$.subscribe(lost);

    await service['handleDeviceChange']();

    expect(lost).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(service['track']).toBe(track);
  });

  it('stops the captured stream on release', () => {
    const stop = vi.fn();
    const track = {
      stop,
      readyState: 'live',
    } as unknown as MediaStreamTrack;
    service['track'] = track;
    service['stream'] = {
      getTracks: () => [track],
    } as unknown as MediaStream;

    service.release();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(service['track']).toBeNull();
    expect(service['stream']).toBeNull();
  });

  it('ignores device changes while the selected camera is still present', async () => {
    service['track'] = { readyState: 'live' } as MediaStreamTrack;
    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'cam-1' },
    ]);
    const lost = vi.fn();
    service.deviceLost$.subscribe(lost);

    await service['handleDeviceChange']();

    expect(lost).not.toHaveBeenCalled();
  });
});
