import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '@core/stores/settings.store';
import { MediaDevicesService } from './media-devices.service';
import { ScreenCaptureService } from './screen-capture.service';

describe('ScreenCaptureService', () => {
  let service: ScreenCaptureService;
  let mediaDevicesService: {
    isDisplayMediaSupported: ReturnType<typeof vi.fn>;
    getDisplayMedia: ReturnType<typeof vi.fn>;
  };

  const mockVideoTrack = {
    kind: 'video',
    contentHint: '',
    addEventListener: vi.fn(),
    stop: vi.fn(),
    readyState: 'live',
  } as unknown as MediaStreamTrack;

  const mockAudioTrack = {
    kind: 'audio',
    addEventListener: vi.fn(),
    stop: vi.fn(),
    readyState: 'live',
  } as unknown as MediaStreamTrack;

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      mediaDevices: { getDisplayMedia: vi.fn() },
    });

    mediaDevicesService = {
      isDisplayMediaSupported: vi.fn().mockReturnValue(true),
      getDisplayMedia: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ScreenCaptureService,
        {
          provide: MediaDevicesService,
          useValue: mediaDevicesService,
        },
        {
          provide: SettingsStore,
          useValue: {
            screenHeight: () => 720,
            screenFps: () => 30,
          },
        },
      ],
    });

    service = TestBed.inject(ScreenCaptureService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports support from mediaDevicesService', () => {
    mediaDevicesService.isDisplayMediaSupported.mockReturnValue(true);
    expect(service.isSupported()).toBe(true);

    mediaDevicesService.isDisplayMediaSupported.mockReturnValue(false);
    expect(service.isSupported()).toBe(false);
  });

  it('propagates error when mediaDevicesService rejects', async () => {
    mediaDevicesService.getDisplayMedia.mockRejectedValue(
      new Error('Screen sharing is not supported in this browser'),
    );
    await expect(service.getTracks()).rejects.toThrow(
      'Screen sharing is not supported in this browser',
    );
  });

  it('captures screen tracks via MediaDevicesService and attaches ended listener', async () => {
    const mockStream = {
      getVideoTracks: () => [mockVideoTrack],
      getAudioTracks: () => [mockAudioTrack],
      getTracks: () => [mockVideoTrack, mockAudioTrack],
    } as unknown as MediaStream;

    mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

    const result = await service.getTracks();
    expect(result.videoTrack).toBe(mockVideoTrack);
    expect(result.audioTrack).toBe(mockAudioTrack);
    expect(mockVideoTrack.contentHint).toBe('detail');
    expect(mediaDevicesService.getDisplayMedia).toHaveBeenCalledWith({
      video: {
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: true,
    });
    expect(mockVideoTrack.addEventListener).toHaveBeenCalledWith(
      'ended',
      expect.any(Function),
    );
  });

  it('sets contentHint from the content mode', async () => {
    const mockStream = {
      getVideoTracks: () => [mockVideoTrack],
      getAudioTracks: () => [],
      getTracks: () => [mockVideoTrack],
    } as unknown as MediaStream;

    mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

    await service.getTracks({ contentMode: 'motion' });
    expect(mockVideoTrack.contentHint).toBe('motion');

    await service.getTracks({ contentMode: 'detail', fps: 60 });
    expect(mockVideoTrack.contentHint).toBe('detail');
  });

  it('throws and stops tracks when stream has no video track', async () => {
    const stopMock = vi.fn();
    const badTrack = { stop: stopMock } as unknown as MediaStreamTrack;
    const mockStream = {
      getVideoTracks: () => [],
      getAudioTracks: () => [],
      getTracks: () => [badTrack],
    } as unknown as MediaStream;

    mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

    await expect(service.getTracks()).rejects.toThrow(
      'Screen share has no video track',
    );
    expect(stopMock).toHaveBeenCalled();
  });

  it('releases tracks properly', async () => {
    const stopVideo = vi.fn();
    const stopAudio = vi.fn();
    const videoTrack = {
      kind: 'video',
      readyState: 'live',
      stop: stopVideo,
      addEventListener: vi.fn(),
    } as unknown as MediaStreamTrack;
    const audioTrack = {
      kind: 'audio',
      readyState: 'live',
      stop: stopAudio,
      addEventListener: vi.fn(),
    } as unknown as MediaStreamTrack;

    const mockStream = {
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
      getTracks: () => [videoTrack, audioTrack],
    } as unknown as MediaStream;

    mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

    await service.getTracks();
    service.release();

    expect(stopVideo).toHaveBeenCalled();
    expect(stopAudio).toHaveBeenCalled();
  });

  it('releases tracks when video track triggers ended event', async () => {
    let endedHandler: (() => void) | undefined;
    const testVideoTrack = {
      kind: 'video',
      readyState: 'live',
      stop: vi.fn(),
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === 'ended') {
          endedHandler = handler;
        }
      }),
    } as unknown as MediaStreamTrack;

    const mockStream = {
      getVideoTracks: () => [testVideoTrack],
      getAudioTracks: () => [],
      getTracks: () => [testVideoTrack],
    } as unknown as MediaStream;

    mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

    await service.getTracks();
    expect(endedHandler).toBeDefined();

    endedHandler?.();
    expect(testVideoTrack.stop).toHaveBeenCalled();
  });

  it('uses custom height and fps options when provided', async () => {
    const mockStream = {
      getVideoTracks: () => [mockVideoTrack],
      getAudioTracks: () => [],
      getTracks: () => [mockVideoTrack],
    } as unknown as MediaStream;

    mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

    await service.getTracks({ height: 1080, fps: 60 });
    expect(mediaDevicesService.getDisplayMedia).toHaveBeenCalledWith({
      video: {
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
      },
      audio: true,
    });
  });
});
