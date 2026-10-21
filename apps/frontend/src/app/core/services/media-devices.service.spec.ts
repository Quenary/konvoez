import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVICE_CHANGE_DEBOUNCE_MS,
  MediaDevicesService,
} from './media-devices.service';

describe('MediaDevicesService', () => {
  let service: MediaDevicesService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [MediaDevicesService],
    });
    service = TestBed.inject(MediaDevicesService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isDisplayMediaSupported', () => {
    it('returns true when navigator.mediaDevices.getDisplayMedia is a function', () => {
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia: vi.fn() },
      });
      expect(service.isDisplayMediaSupported()).toBe(true);
    });

    it('returns false when getDisplayMedia is missing', () => {
      vi.stubGlobal('navigator', {
        mediaDevices: {},
      });
      expect(service.isDisplayMediaSupported()).toBe(false);
    });
  });

  describe('getDisplayMedia', () => {
    it('throws when getDisplayMedia is not supported', async () => {
      vi.stubGlobal('navigator', { mediaDevices: {} });
      await expect(service.getDisplayMedia()).rejects.toThrow(
        'Screen sharing is not supported in this browser',
      );
    });

    it('returns stream on successful capture with audio', async () => {
      const mockStream = { id: 'stream-with-audio' } as unknown as MediaStream;
      const getDisplayMedia = vi.fn().mockResolvedValue(mockStream);
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      const stream = await service.getDisplayMedia({
        video: true,
        audio: true,
      });

      expect(stream).toBe(mockStream);
      expect(getDisplayMedia).toHaveBeenCalledWith({
        video: true,
        audio: true,
      });
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('falls back to audio: false when audio capture fails with capture constraints AbortError', async () => {
      const mockStreamWithoutAudio = {
        id: 'stream-no-audio',
      } as unknown as MediaStream;
      const getDisplayMedia = vi
        .fn()
        .mockRejectedValueOnce(
          new DOMException('Invalid capture constraints', 'AbortError'),
        )
        .mockResolvedValueOnce(mockStreamWithoutAudio);
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      const stream = await service.getDisplayMedia({
        video: { height: 720 },
        audio: true,
      });

      expect(stream).toBe(mockStreamWithoutAudio);
      expect(getDisplayMedia).toHaveBeenCalledTimes(2);
      expect(getDisplayMedia).toHaveBeenNthCalledWith(1, {
        video: { height: 720 },
        audio: true,
      });
      expect(getDisplayMedia).toHaveBeenNthCalledWith(2, {
        video: { height: 720 },
        audio: false,
      });
    });

    it('rethrows NotAllowedError immediately without fallback', async () => {
      const getDisplayMedia = vi
        .fn()
        .mockRejectedValue(
          new DOMException('Permission denied', 'NotAllowedError'),
        );
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      await expect(
        service.getDisplayMedia({ video: true, audio: true }),
      ).rejects.toThrow('Permission denied');
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('rethrows AbortError without capture constraints in message immediately without fallback', async () => {
      const getDisplayMedia = vi
        .fn()
        .mockRejectedValue(new DOMException('User cancelled', 'AbortError'));
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      await expect(
        service.getDisplayMedia({ video: true, audio: true }),
      ).rejects.toThrow('User cancelled');
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('rethrows picker dismissal AbortError immediately without fallback', async () => {
      const getDisplayMedia = vi
        .fn()
        .mockRejectedValue(
          new DOMException('Permission dismissed', 'AbortError'),
        );
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      await expect(
        service.getDisplayMedia({ video: true, audio: true }),
      ).rejects.toThrow('Permission dismissed');
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('rethrows non-AbortError errors immediately without fallback', async () => {
      const getDisplayMedia = vi
        .fn()
        .mockRejectedValue(
          new DOMException('Could not start video source', 'NotReadableError'),
        );
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      await expect(
        service.getDisplayMedia({ video: true, audio: true }),
      ).rejects.toThrow('Could not start video source');
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('rethrows immediately when audio was not requested and capture fails', async () => {
      const getDisplayMedia = vi
        .fn()
        .mockRejectedValue(new DOMException('Failed', 'AbortError'));
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      await expect(
        service.getDisplayMedia({ video: true, audio: false }),
      ).rejects.toThrow('Failed');
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    });

    it('rethrows error when fallback to audio: false also fails', async () => {
      const getDisplayMedia = vi
        .fn()
        .mockRejectedValueOnce(
          new DOMException('Invalid capture constraints', 'AbortError'),
        )
        .mockRejectedValueOnce(
          new DOMException('Hardware error', 'AbortError'),
        );
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      await expect(
        service.getDisplayMedia({ video: true, audio: true }),
      ).rejects.toThrow('Hardware error');
      expect(getDisplayMedia).toHaveBeenCalledTimes(2);
    });

    it('rethrows standard Error with name NotAllowedError immediately without fallback', async () => {
      const customErr = new Error('User cancelled');
      customErr.name = 'NotAllowedError';
      const getDisplayMedia = vi.fn().mockRejectedValue(customErr);
      vi.stubGlobal('navigator', {
        mediaDevices: { getDisplayMedia },
      });

      await expect(
        service.getDisplayMedia({ video: true, audio: true }),
      ).rejects.toThrow('User cancelled');
      expect(getDisplayMedia).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserMedia', () => {
    it('calls navigator.mediaDevices.getUserMedia when available', async () => {
      const mockStream = { id: 'gum' } as unknown as MediaStream;
      const getUserMedia = vi.fn().mockResolvedValue(mockStream);
      vi.stubGlobal('navigator', {
        mediaDevices: { getUserMedia },
      });

      const res = await service.getUserMedia({ audio: true });
      expect(res).toBe(mockStream);
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    });

    it('rejects when getUserMedia is missing', async () => {
      vi.stubGlobal('navigator', { mediaDevices: {} });
      await expect(
        service.getUserMedia({ audio: true }),
      ).rejects.toBeUndefined();
    });
  });

  describe('enumerateDevices', () => {
    it('calls navigator.mediaDevices.enumerateDevices when available', async () => {
      const mockDevices = [{ deviceId: '1' }] as MediaDeviceInfo[];
      const enumerateDevices = vi.fn().mockResolvedValue(mockDevices);
      vi.stubGlobal('navigator', {
        mediaDevices: { enumerateDevices },
      });

      const res = await service.enumerateDevices();
      expect(res).toBe(mockDevices);
      expect(enumerateDevices).toHaveBeenCalledTimes(1);
    });

    it('rejects when enumerateDevices is missing', async () => {
      vi.stubGlobal('navigator', { mediaDevices: {} });
      await expect(service.enumerateDevices()).rejects.toBeUndefined();
    });
  });

  describe('deviceChange$', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('debounces devicechange bursts and removes the listener on unsubscribe', () => {
      vi.useFakeTimers();
      const target = new EventTarget();
      const removeEventListener = vi.spyOn(target, 'removeEventListener');
      vi.stubGlobal('navigator', { mediaDevices: target });
      const changed = vi.fn();

      const subscription = service.deviceChange$.subscribe(changed);
      target.dispatchEvent(new Event('devicechange'));
      target.dispatchEvent(new Event('devicechange'));
      vi.advanceTimersByTime(DEVICE_CHANGE_DEBOUNCE_MS);

      expect(changed).toHaveBeenCalledTimes(1);

      subscription.unsubscribe();
      expect(removeEventListener).toHaveBeenCalledWith(
        'devicechange',
        expect.any(Function),
        undefined,
      );
    });

    it('completes immediately without the MediaDevices API', () => {
      vi.stubGlobal('navigator', {});
      const complete = vi.fn();

      service.deviceChange$.subscribe({ complete });

      expect(complete).toHaveBeenCalled();
    });
  });
});
