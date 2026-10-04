import { TestBed } from '@angular/core/testing';
import { attachmentsMaxPosterSize } from '@konvoez/shared';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  posterPixelSize,
  posterSeekSeconds,
  VideoPosterService,
} from './video-poster.service';

describe('poster helpers', () => {
  it('seeks to one second or half the clip', () => {
    expect(posterSeekSeconds(10)).toBe(1);
    expect(posterSeekSeconds(0.4)).toBe(0.2);
    expect(posterSeekSeconds(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('fits the long side inside 1024', () => {
    expect(posterPixelSize(2000, 1000)).toEqual({ width: 1024, height: 512 });
    expect(posterPixelSize(320, 180)).toEqual({ width: 320, height: 180 });
    expect(posterPixelSize(0, 10)).toBeNull();
  });
});

describe('VideoPosterService', () => {
  let service: VideoPosterService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(VideoPosterService);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('draws a webp poster from metadata and seeked', async () => {
    vi.useRealTimers();
    const video = fakeVideo({
      duration: 10,
      videoWidth: 2000,
      videoHeight: 1000,
    });
    const canvas = fakeCanvas(new Blob(['webp'], { type: 'image/webp' }));
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return video as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return canvas as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const pending = firstValueFrom(
      service.capture('a', new File(['v'], 'clip.mp4', { type: 'video/mp4' })),
    );
    await Promise.resolve();
    video.dispatchEvent(new Event('loadedmetadata'));
    const result = await pending;

    expect(video.currentTime).toBe(1);
    expect(result?.poster?.type).toBe('image/webp');
    expect(result?.displayWidth).toBe(1024);
    expect(result?.displayHeight).toBe(512);
    expect(result?.videoWidth).toBe(2000);
    expect(result?.durationSeconds).toBe(10);
  });

  it('falls back to jpeg when webp encoding returns nothing', async () => {
    vi.useRealTimers();
    const video = fakeVideo({ duration: 4, videoWidth: 100, videoHeight: 80 });
    const canvas = fakeCanvas(null, new Blob(['jpg'], { type: 'image/jpeg' }));
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return video as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return canvas as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const pending = firstValueFrom(
      service.capture('b', new File(['v'], 'clip.mp4', { type: 'video/mp4' })),
    );
    await Promise.resolve();
    video.dispatchEvent(new Event('loadedmetadata'));
    const result = await pending;

    expect(result?.poster?.type).toBe('image/jpeg');
    expect(result?.displayWidth).toBe(100);
  });

  it('falls back to jpeg when webkit labels a png as webp', async () => {
    vi.useRealTimers();
    const video = fakeVideo({ duration: 4, videoWidth: 100, videoHeight: 80 });
    const canvas = Document.prototype.createElement.call(
      document,
      'canvas',
    ) as HTMLCanvasElement;
    canvas.getContext = vi.fn(() => ({
      drawImage: vi.fn(),
    })) as unknown as HTMLCanvasElement['getContext'];
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback, type) => {
        callback(
          type === 'image/webp'
            ? new Blob(['png'], { type: 'image/png' })
            : new Blob(['jpg'], { type: 'image/jpeg' }),
        );
      });
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return video as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return canvas as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const pending = firstValueFrom(
      service.capture(
        'safari',
        new File(['v'], 'clip.mp4', { type: 'video/mp4' }),
      ),
    );
    await Promise.resolve();
    video.dispatchEvent(new Event('loadedmetadata'));
    const result = await pending;

    expect(toBlob).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      'image/webp',
      0.8,
    );
    expect(toBlob).toHaveBeenNthCalledWith(
      2,
      expect.any(Function),
      'image/jpeg',
      0.8,
    );
    expect(result?.poster?.type).toBe('image/jpeg');
    expect(result?.poster?.name).toBe('poster.jpg');
  });

  it('drops an oversized poster blob', async () => {
    vi.useRealTimers();
    const video = fakeVideo({ duration: 4, videoWidth: 100, videoHeight: 80 });
    const oversized = new Blob(['webp'], { type: 'image/webp' });
    Object.defineProperty(oversized, 'size', {
      value: attachmentsMaxPosterSize + 1,
    });
    const canvas = fakeCanvas(oversized);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return video as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return canvas as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const pending = firstValueFrom(
      service.capture(
        'oversize',
        new File(['v'], 'clip.mp4', { type: 'video/mp4' }),
      ),
    );
    await Promise.resolve();
    video.dispatchEvent(new Event('loadedmetadata'));
    const result = await pending;

    expect(result?.poster).toBeNull();
  });

  it('returns null when the grab times out', async () => {
    const video = fakeVideo({ duration: 4, videoWidth: 10, videoHeight: 10 });
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return video as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const pending = firstValueFrom(
      service.capture('c', new File(['v'], 'clip.mp4', { type: 'video/mp4' })),
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).resolves.toBeNull();
  });

  it('dispose drops the element and resolves null', async () => {
    const video = fakeVideo({ duration: 4, videoWidth: 10, videoHeight: 10 });
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        return video as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    const revoke = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    const pending = firstValueFrom(
      service.capture('d', new File(['v'], 'clip.mp4', { type: 'video/mp4' })),
    );
    await Promise.resolve();
    service.dispose('d');
    await expect(pending).resolves.toBeNull();
    expect(revoke).toHaveBeenCalledWith('blob:video');
    expect(video.parentElement).toBeNull();
  });

  it('runs at most two grabs at once', async () => {
    let videos = 0;
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        videos += 1;
        return fakeVideo({
          duration: 2,
          videoWidth: 8,
          videoHeight: 8,
        }) as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    service.capture('1', file).subscribe();
    service.capture('2', file).subscribe();
    service.capture('3', file).subscribe();
    await Promise.resolve();
    expect(videos).toBe(2);
  });

  it('replays one grab to capture and whenReady', async () => {
    vi.useRealTimers();
    let videos = 0;
    const video = fakeVideo({ duration: 3, videoWidth: 20, videoHeight: 10 });
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') {
        videos += 1;
        return video as unknown as HTMLElement;
      }
      if (tag === 'canvas') {
        return fakeCanvas(
          new Blob(['webp'], { type: 'image/webp' }),
        ) as unknown as HTMLElement;
      }
      return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    const file = new File(['v'], 'clip.mp4', { type: 'video/mp4' });
    const captured = firstValueFrom(service.capture('same', file));
    const watched = firstValueFrom(service.whenReady('same'));
    await Promise.resolve();
    video.dispatchEvent(new Event('loadedmetadata'));
    const [first, second] = await Promise.all([captured, watched]);

    expect(videos).toBe(1);
    expect(first).toBe(second);
    expect(first?.durationSeconds).toBe(3);
    await expect(
      firstValueFrom(service.whenReady('missing')),
    ).resolves.toBeNull();
  });
});

function fakeVideo(values: {
  duration: number;
  videoWidth: number;
  videoHeight: number;
}): HTMLVideoElement {
  const video = Document.prototype.createElement.call(
    document,
    'video',
  ) as HTMLVideoElement;
  Object.defineProperty(video, 'duration', { value: values.duration });
  Object.defineProperty(video, 'videoWidth', {
    value: values.videoWidth,
    writable: true,
  });
  Object.defineProperty(video, 'videoHeight', {
    value: values.videoHeight,
    writable: true,
  });
  video.play = vi.fn(() => Promise.resolve());
  video.pause = vi.fn();
  video.load = vi.fn();
  video.requestVideoFrameCallback = ((callback: VideoFrameRequestCallback) => {
    queueMicrotask(() => callback(0, {} as VideoFrameCallbackMetadata));
    return 1;
  }) as HTMLVideoElement['requestVideoFrameCallback'];
  let time = 0;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (value: number) => {
      time = value;
      video.dispatchEvent(new Event('seeked'));
    },
  });
  return video;
}

function fakeCanvas(
  webp: Blob | null,
  jpeg: Blob | null = null,
): HTMLCanvasElement {
  const canvas = Document.prototype.createElement.call(
    document,
    'canvas',
  ) as HTMLCanvasElement;
  canvas.getContext = vi.fn(() => ({
    drawImage: vi.fn(),
  })) as unknown as HTMLCanvasElement['getContext'];
  canvas.toBlob = vi.fn((callback, type) => {
    callback(type === 'image/webp' ? webp : jpeg);
  }) as HTMLCanvasElement['toBlob'];
  return canvas;
}
