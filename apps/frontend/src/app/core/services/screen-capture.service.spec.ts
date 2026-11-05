import { TestBed } from '@angular/core/testing';
import { TranslateService } from '@ngx-translate/core';
import { TuiNotificationService } from '@taiga-ui/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TScreenAudioMode } from '@konvoez/shared';
import { SettingsStore } from '@core/stores/settings.store';
import { MediaDevicesService } from './media-devices.service';
import { ScreenCaptureService } from './screen-capture.service';
import { AudioContextResumeService } from './audio-context-resume.service';

describe('ScreenCaptureService', () => {
  let service: ScreenCaptureService;
  let notifications: { open: ReturnType<typeof vi.fn> };
  let translate: { instant: ReturnType<typeof vi.fn> };
  let mediaDevicesService: {
    isDisplayMediaSupported: ReturnType<typeof vi.fn>;
    getDisplayMedia: ReturnType<typeof vi.fn>;
  };
  let audioContextResumeService: {
    register: ReturnType<typeof vi.fn>;
    unregister: ReturnType<typeof vi.fn>;
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
    audioContextResumeService = {
      register: vi.fn(),
      unregister: vi.fn(),
    };
    notifications = {
      open: vi.fn(() => ({ subscribe: vi.fn() })),
    };
    translate = {
      instant: vi.fn((key: string) => key),
    };

    TestBed.configureTestingModule({
      providers: [
        ScreenCaptureService,
        {
          provide: MediaDevicesService,
          useValue: mediaDevicesService,
        },
        {
          provide: AudioContextResumeService,
          useValue: audioContextResumeService,
        },
        {
          provide: SettingsStore,
          useValue: {
            screenHeight: () => 720,
            screenFps: () => 30,
          },
        },
        { provide: TuiNotificationService, useValue: notifications },
        { provide: TranslateService, useValue: translate },
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

  describe('desktop native audio support', () => {
    it('calls getDisplayMedia with no waiting when bridge.nativeAudio is false', async () => {
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: false,
        },
      });

      const mockStream = {
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockVideoTrack, mockAudioTrack],
      } as unknown as MediaStream;
      mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

      const result = await service.getTracks();
      expect(result.videoTrack).toBe(mockVideoTrack);
      expect(result.audioTrack).toBe(mockAudioTrack);
    });

    it('uses the display-media audio track when native capture declines', async () => {
      let portListener: ((port: MessagePort | null) => void) | undefined;
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: true,
          onScreenAudioPort: vi.fn(
            (listener: (port: MessagePort | null) => void) => {
              portListener = listener;
              return () => undefined;
            },
          ),
        },
      });
      mediaDevicesService.getDisplayMedia.mockResolvedValue({
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockVideoTrack, mockAudioTrack],
      } as unknown as MediaStream);

      const promise = service.getTracks();
      portListener?.(null);
      const result = await promise;

      expect(result.videoTrack).toBe(mockVideoTrack);
      expect(result.audioTrack).toBe(mockAudioTrack);
      expect(notifications.open).not.toHaveBeenCalled();
    });

    it.each(['include', 'exclude'] as const)(
      'does not warn when native capture reports %s',
      async (mode: TScreenAudioMode) => {
        let portListener:
          | ((port: MessagePort | null, mode: TScreenAudioMode) => void)
          | undefined;
        vi.stubGlobal('window', {
          konvoezDesktop: {
            apiVersion: 2,
            nativeAudio: true,
            onScreenAudioPort: vi.fn((listener) => {
              portListener = listener;
              return () => undefined;
            }),
          },
        });
        mediaDevicesService.getDisplayMedia.mockResolvedValue({
          getVideoTracks: () => [mockVideoTrack],
          getAudioTracks: () => [mockAudioTrack],
          getTracks: () => [mockVideoTrack, mockAudioTrack],
        } as unknown as MediaStream);

        const promise = service.getTracks();
        portListener?.(null, mode);
        await promise;

        expect(notifications.open).not.toHaveBeenCalled();
      },
    );

    it('warns when screen audio falls back to system loopback', async () => {
      let portListener:
        | ((port: MessagePort | null, mode: TScreenAudioMode) => void)
        | undefined;
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: true,
          onScreenAudioPort: vi.fn((listener) => {
            portListener = listener;
            return () => undefined;
          }),
        },
      });
      mediaDevicesService.getDisplayMedia.mockResolvedValue({
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [mockAudioTrack],
        getTracks: () => [mockVideoTrack, mockAudioTrack],
      } as unknown as MediaStream);

      const promise = service.getTracks();
      portListener?.(null, 'loopback');
      await promise;

      expect(translate.instant).toHaveBeenCalledWith(
        'CALL.SCREEN_AUDIO_LOOPBACK',
      );
      expect(notifications.open).toHaveBeenCalledWith(
        'CALL.SCREEN_AUDIO_LOOPBACK',
        expect.objectContaining({ appearance: 'warning' }),
      );
    });

    it('falls back to null audioTrack when native audio port times out', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: true,
          onScreenAudioPort: vi.fn(),
        },
      });

      const mockStream = {
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [],
        getTracks: () => [mockVideoTrack],
      } as unknown as MediaStream;
      mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

      const promise = service.getTracks();
      await vi.advanceTimersByTimeAsync(2000);
      const result = await promise;

      expect(result.videoTrack).toBe(mockVideoTrack);
      expect(result.audioTrack).toBeNull();
      vi.useRealTimers();
    });

    it('does not time out the port while getDisplayMedia is still pending', async () => {
      vi.useFakeTimers();
      let resolveMedia: ((stream: MediaStream) => void) | undefined;
      mediaDevicesService.getDisplayMedia.mockReturnValue(
        new Promise<MediaStream>((resolve) => {
          resolveMedia = resolve;
        }),
      );
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: true,
          onScreenAudioPort: vi.fn(() => () => undefined),
        },
      });

      let settled = false;
      const promise = service.getTracks().finally(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(settled).toBe(false);

      resolveMedia?.({
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [],
        getTracks: () => [mockVideoTrack],
      } as unknown as MediaStream);
      await vi.advanceTimersByTimeAsync(2000);
      await promise;
      expect(settled).toBe(true);
      vi.useRealTimers();
    });

    it('stops a port that arrives after the post-capture wait has ended', async () => {
      vi.useFakeTimers();
      let portListener: ((port: MessagePort) => void) | undefined;
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: true,
          onScreenAudioPort: vi.fn((listener: (port: MessagePort) => void) => {
            portListener = listener;
            return () => undefined;
          }),
        },
      });
      mediaDevicesService.getDisplayMedia.mockResolvedValue({
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [],
        getTracks: () => [mockVideoTrack],
      } as unknown as MediaStream);

      const promise = service.getTracks();
      await vi.advanceTimersByTimeAsync(2000);
      await promise;

      const latePort = {
        postMessage: vi.fn(),
        close: vi.fn(),
      } as unknown as MessagePort;
      portListener?.(latePort);
      expect(latePort.postMessage).toHaveBeenCalledWith('stop');
      expect(latePort.close).toHaveBeenCalled();
      vi.useRealTimers();
    });

    it('cleans up port listener and closes arriving port when getDisplayMedia fails', async () => {
      const mockPort = {
        postMessage: vi.fn(),
        close: vi.fn(),
      } as unknown as MessagePort;

      const cleanupListener = vi.fn();
      let portListener: ((port: MessagePort) => void) | undefined;
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: true,
          onScreenAudioPort: vi.fn((listener) => {
            portListener = listener;
            return cleanupListener;
          }),
        },
      });

      mediaDevicesService.getDisplayMedia.mockRejectedValue(
        new Error('Permission denied'),
      );

      await expect(service.getTracks()).rejects.toThrow('Permission denied');
      expect(cleanupListener).toHaveBeenCalled();

      // If port arrives after failure/cancellation, it should be closed immediately
      portListener?.(mockPort);
      expect(mockPort.postMessage).toHaveBeenCalledWith('stop');
      expect(mockPort.close).toHaveBeenCalled();
    });

    it('resumes audio context before connecting native screen audio', async () => {
      const mockPort = {
        postMessage: vi.fn(),
        close: vi.fn(),
      } as unknown as MessagePort;

      let portListener: ((port: MessagePort) => void) | undefined;
      vi.stubGlobal('window', {
        konvoezDesktop: {
          apiVersion: 2,
          nativeAudio: true,
          onScreenAudioPort: vi.fn((listener) => {
            portListener = listener;
            return () => undefined;
          }),
        },
      });

      const mockStream = {
        getVideoTracks: () => [mockVideoTrack],
        getAudioTracks: () => [],
        getTracks: () => [mockVideoTrack],
      } as unknown as MediaStream;
      mediaDevicesService.getDisplayMedia.mockResolvedValue(mockStream);

      const capturedTrack = {
        kind: 'audio',
        stop: vi.fn(),
        addEventListener: vi.fn(),
      } as unknown as MediaStreamTrack;

      const mockWorkletPort = { postMessage: vi.fn() };
      const mockWorkletNode = {
        port: mockWorkletPort,
        connect: vi.fn(),
        disconnect: vi.fn(),
      };
      const mockDestNode = {
        stream: {
          getAudioTracks: () => [capturedTrack],
        },
      };
      let mockAudioContextState: AudioContextState = 'suspended';
      const resumeAudioContext = vi.fn(async () => {
        mockAudioContextState = 'running';
      });

      class MockAudioContext {
        sampleRate = 48000;
        get state(): AudioContextState {
          return mockAudioContextState;
        }
        audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
        createMediaStreamDestination = vi.fn().mockReturnValue(mockDestNode);
        resume = resumeAudioContext;
        close = vi.fn().mockResolvedValue(undefined);
      }

      class MockAudioWorkletNode {
        constructor() {
          return mockWorkletNode as unknown as AudioWorkletNode;
        }
      }

      vi.stubGlobal('AudioContext', MockAudioContext);
      vi.stubGlobal('AudioWorkletNode', MockAudioWorkletNode);

      const promise = service.getTracks();
      portListener?.(mockPort);

      const result = await promise;
      expect(result.videoTrack).toBe(mockVideoTrack);
      expect(result.audioTrack).toBe(capturedTrack);
      expect(mockWorkletPort.postMessage).toHaveBeenCalledWith(mockPort, [
        mockPort,
      ]);
      expect(audioContextResumeService.register).toHaveBeenCalledOnce();
      expect(audioContextResumeService.register).toHaveBeenCalledWith(
        expect.objectContaining({ sampleRate: 48000 }),
      );
      expect(resumeAudioContext).toHaveBeenCalledOnce();
      expect(mockAudioContextState).toBe('running');
      expect(audioContextResumeService.unregister).not.toHaveBeenCalled();

      service.release();
      expect(audioContextResumeService.unregister).toHaveBeenCalledOnce();
      expect(mockWorkletPort.postMessage).toHaveBeenCalledWith('stop');
      expect(mockPort.postMessage).not.toHaveBeenCalledWith('stop');
      expect(capturedTrack.stop).toHaveBeenCalled();
    });
  });
});
