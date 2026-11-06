import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  availableVideoCodecs,
  cachedH264Profile,
  cachedHardwareEncoders,
  clearHardwareEncoderCache,
  detectHardwareEncoders,
  deviceCanReceiveCodec,
  hardwareEncoderProbe,
  pickDefaultVideoCodec,
  pickH264Codec,
  resolveDefaultVideoCodec,
  streamProbeWidth,
} from './video-codec';

describe('availableVideoCodecs', () => {
  it('offers a codec only when the device can send it', () => {
    expect(
      availableVideoCodecs({
        senderMimes: ['video/VP8', 'video/VP9', 'video/AV1', 'video/H264'],
        deviceMimes: ['video/VP8', 'video/VP9'],
      }),
    ).toEqual(['vp9', 'vp8']);
    expect(
      availableVideoCodecs({
        senderMimes: ['video/H264', 'video/VP8', 'video/VP9', 'video/AV1'],
        deviceMimes: ['video/H264', 'video/VP8', 'video/VP9', 'video/AV1'],
      }),
    ).toEqual(['av1', 'h264', 'vp9', 'vp8']);
    expect(
      availableVideoCodecs({
        senderMimes: ['video/H264', 'video/VP8', 'video/VP9'],
        deviceMimes: ['video/H264', 'video/VP8'],
      }),
    ).toEqual(['h264', 'vp8']);
    expect(
      availableVideoCodecs({
        senderMimes: ['video/AV1', 'video/H264'],
        deviceMimes: null,
      }),
    ).toEqual([]);
  });
});

describe('deviceCanReceiveCodec', () => {
  it('matches the mime type ignoring case', () => {
    expect(deviceCanReceiveCodec(['video/VP9'], 'vp9')).toBe(true);
    expect(deviceCanReceiveCodec(['video/VP8'], 'av1')).toBe(false);
  });
});

describe('pickDefaultVideoCodec', () => {
  const all = ['av1', 'h264', 'vp9', 'vp8'] as const;

  it.each([
    {
      name: 'hardware AV1',
      available: all,
      hardware: { av1: true, h264: true },
      expected: 'av1',
    },
    {
      name: 'hardware H.264 when AV1 is not hardware',
      available: all,
      hardware: { av1: false, h264: true },
      expected: 'h264',
    },
    {
      name: 'hardware H.264 when AV1 is not offered',
      available: ['h264', 'vp9', 'vp8'] as const,
      hardware: { av1: true, h264: true },
      expected: 'h264',
    },
    {
      name: 'VP9 when neither encoder is hardware',
      available: all,
      hardware: { av1: false, h264: false },
      expected: 'vp9',
    },
    {
      name: 'VP9 when hardware AV1 is not offered and H.264 is software',
      available: ['h264', 'vp9', 'vp8'] as const,
      hardware: { av1: true, h264: false },
      expected: 'vp9',
    },
    {
      name: 'VP8 when VP9 is missing',
      available: ['vp8'] as const,
      hardware: { av1: false, h264: false },
      expected: 'vp8',
    },
    {
      name: 'the first offered codec when VP9 and VP8 are missing',
      available: ['h264'] as const,
      hardware: { av1: false, h264: false },
      expected: 'h264',
    },
    {
      name: 'VP9 when nothing is offered',
      available: [] as const,
      hardware: { av1: false, h264: false },
      expected: 'vp9',
    },
  ])('$name', ({ available, hardware, expected }) => {
    expect(pickDefaultVideoCodec({ available, hardware })).toBe(expected);
  });
});

describe('streamProbeWidth', () => {
  it('uses an even 16:9 width, or the source width when it is positive', () => {
    expect(streamProbeWidth(720)).toBe(1280);
    expect(streamProbeWidth(1080)).toBe(1920);
    expect(streamProbeWidth(480)).toBe(854);
    expect(streamProbeWidth(720, 640)).toBe(640);
    expect(streamProbeWidth(720, 0)).toBe(1280);
  });
});

describe('detectHardwareEncoders', () => {
  const probe = hardwareEncoderProbe({
    height: 720,
    fps: 30,
    bitrateKbps: 2500,
  });

  beforeEach(() => {
    clearHardwareEncoderCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearHardwareEncoderCache();
  });

  function stubEncodingInfo(
    encodingInfo: (config: {
      video: { contentType: string };
    }) => Promise<{ supported: boolean; powerEfficient: boolean }>,
  ): void {
    vi.stubGlobal('navigator', {
      mediaCapabilities: { encodingInfo },
    });
  }

  it('reports power-efficient encoders and ignores software or unsupported ones', async () => {
    stubEncodingInfo(async (config) => {
      const contentType = config.video.contentType;
      if (contentType === 'video/AV1') {
        return { supported: true, powerEfficient: true };
      }
      return { supported: true, powerEfficient: false };
    });

    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: true,
      h264: false,
      h264Profile: null,
    });

    stubEncodingInfo(async () => ({
      supported: false,
      powerEfficient: true,
    }));
    const other = { ...probe, bitrate: probe.bitrate + 1000 };
    await expect(detectHardwareEncoders(other)).resolves.toEqual({
      av1: false,
      h264: false,
      h264Profile: null,
    });
  });

  it('treats a missing API or a thrown probe as not hardware', async () => {
    vi.stubGlobal('navigator', {});
    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: false,
      h264: false,
      h264Profile: null,
    });

    clearHardwareEncoderCache();
    const encodingInfo = vi.fn(() => Promise.reject(new Error('unsupported')));
    stubEncodingInfo(encodingInfo);
    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: false,
      h264: false,
      h264Profile: null,
    });
    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: false,
      h264: false,
      h264Profile: null,
    });
    expect(encodingInfo).toHaveBeenCalledTimes(4);
  });

  it('treats a probe that exceeds the timeout as not hardware and probes again', async () => {
    vi.useFakeTimers();
    const encodingInfo = vi.fn(
      () =>
        new Promise<{ supported: boolean; powerEfficient: boolean }>(
          (resolve) => {
            setTimeout(
              () => resolve({ supported: true, powerEfficient: true }),
              1_000,
            );
          },
        ),
    );
    stubEncodingInfo(encodingInfo);
    const pending = detectHardwareEncoders(probe);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(pending).resolves.toEqual({
      av1: false,
      h264: false,
      h264Profile: null,
    });
    await vi.advanceTimersByTimeAsync(1_000);

    encodingInfo.mockResolvedValue({ supported: true, powerEfficient: true });
    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: true,
      h264: true,
      h264Profile: '42e01f',
    });
    expect(encodingInfo).toHaveBeenCalledTimes(4);
  });

  it('caches an H.264 profile when AV1 does not answer', async () => {
    vi.useFakeTimers();
    const encodingInfo = vi.fn((config: { video: { contentType: string } }) => {
      if (config.video.contentType === 'video/AV1') {
        return new Promise<{ supported: boolean; powerEfficient: boolean }>(
          () => undefined,
        );
      }
      return Promise.resolve({
        supported: true,
        powerEfficient: config.video.contentType.includes('42e01f'),
      });
    });
    stubEncodingInfo(encodingInfo);

    const pending = detectHardwareEncoders(probe);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toEqual({
      av1: false,
      h264: true,
      h264Profile: '42e01f',
    });
    expect(cachedH264Profile(probe)).toBe('42e01f');

    encodingInfo.mockResolvedValue({ supported: true, powerEfficient: true });
    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: true,
      h264: true,
      h264Profile: '42e01f',
    });
    expect(encodingInfo).toHaveBeenCalledTimes(3);
    expect(encodingInfo).toHaveBeenLastCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ contentType: 'video/AV1' }),
      }),
    );
  });

  it('logs probe parameters and a cached result', async () => {
    const debug = vi
      .spyOn(console, 'debug')
      .mockImplementation(() => undefined);
    stubEncodingInfo(async (config) => ({
      supported: true,
      powerEfficient: config.video.contentType === 'video/AV1',
    }));

    try {
      await detectHardwareEncoders(probe);
      expect(debug).toHaveBeenCalledWith('Hardware encoder probe', {
        contentType: 'video/AV1',
        width: probe.width,
        height: probe.height,
        framerate: probe.framerate,
        bitrate: probe.bitrate,
        result: 'hardware',
      });
      expect(debug).toHaveBeenCalledWith(
        'Hardware encoder probe',
        expect.objectContaining({
          contentType:
            'video/H264;profile-level-id=42e01f;packetization-mode=1',
          result: 'software',
        }),
      );
      expect(debug).toHaveBeenCalledWith(
        'Hardware encoder probe',
        expect.objectContaining({
          contentType:
            'video/H264;profile-level-id=640032;packetization-mode=1',
          result: 'software',
        }),
      );

      debug.mockClear();
      await detectHardwareEncoders(probe);
      expect(debug).toHaveBeenCalledWith('Hardware encoder probe cache', {
        ...probe,
        av1: true,
        h264: false,
        h264Profile: null,
      });
    } finally {
      debug.mockRestore();
    }
  });

  it('caches a parameter set and probes again when the parameters change', async () => {
    const encodingInfo = vi.fn(async () => ({
      supported: true,
      powerEfficient: true,
    }));
    stubEncodingInfo(encodingInfo);

    await detectHardwareEncoders(probe);
    expect(encodingInfo).toHaveBeenCalledTimes(2);
    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: true,
      h264: true,
      h264Profile: '42e01f',
    });
    expect(encodingInfo).toHaveBeenCalledTimes(2);
    expect(cachedHardwareEncoders(probe)).toEqual({
      av1: true,
      h264: true,
      h264Profile: '42e01f',
    });
    expect(cachedHardwareEncoders({ ...probe, height: 1080 })).toEqual({
      av1: false,
      h264: false,
      h264Profile: null,
    });

    await detectHardwareEncoders({ ...probe, height: 1080, width: 1920 });
    expect(encodingInfo).toHaveBeenCalledTimes(4);
    expect(encodingInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'webrtc',
        video: expect.objectContaining({
          contentType: 'video/AV1',
          width: 1280,
          height: 720,
          framerate: 30,
          bitrate: 2_500_000,
        }),
      }),
    );
  });
});

describe('H.264 hardware profile', () => {
  const probe = hardwareEncoderProbe({
    height: 720,
    fps: 30,
    bitrateKbps: 2500,
  });

  beforeEach(() => {
    clearHardwareEncoderCache();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearHardwareEncoderCache();
  });

  it('keeps Constrained Baseline when it is hardware and does not ask for High', async () => {
    const encodingInfo = vi.fn(
      async (config: { video: { contentType: string } }) => ({
        supported: true,
        powerEfficient: config.video.contentType.includes('42e01f'),
      }),
    );
    vi.stubGlobal('navigator', { mediaCapabilities: { encodingInfo } });

    await expect(detectHardwareEncoders(probe)).resolves.toEqual({
      av1: false,
      h264: true,
      h264Profile: '42e01f',
    });
    expect(encodingInfo).toHaveBeenCalledTimes(2);
    expect(encodingInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          contentType: expect.stringContaining('640032'),
        }),
      }),
    );
  });

  it('does not keep High when Constrained Baseline does not answer', async () => {
    vi.useFakeTimers();
    const encodingInfo = vi.fn((config: { video: { contentType: string } }) => {
      if (config.video.contentType.includes('42e01f')) {
        return new Promise<{ supported: boolean; powerEfficient: boolean }>(
          () => undefined,
        );
      }
      return Promise.resolve({ supported: true, powerEfficient: true });
    });
    vi.stubGlobal('navigator', { mediaCapabilities: { encodingInfo } });

    const pending = detectHardwareEncoders(probe);
    await vi.advanceTimersByTimeAsync(500);
    await expect(pending).resolves.toEqual({
      av1: true,
      h264: false,
      h264Profile: null,
    });
    expect(cachedH264Profile(probe)).toBeNull();
    expect(encodingInfo).not.toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({
          contentType: expect.stringContaining('640032'),
        }),
      }),
    );
  });

  it('uses High when Constrained Baseline is software', async () => {
    const encodingInfo = vi.fn(
      async (config: { video: { contentType: string } }) => ({
        supported: true,
        powerEfficient: config.video.contentType.includes('640032'),
      }),
    );
    vi.stubGlobal('navigator', { mediaCapabilities: { encodingInfo } });

    await detectHardwareEncoders(probe);
    expect(cachedH264Profile(probe)).toBe('640032');
    expect(
      cachedH264Profile({ ...probe, bitrate: probe.bitrate + 1_000 }),
    ).toBe('640032');
    expect(cachedH264Profile({ ...probe, height: 1080 })).toBeNull();
  });

  it('publishes the hardware profile only when the device offers it', () => {
    const constrained = {
      mimeType: 'video/H264',
      parameters: { 'profile-level-id': '42e01f' },
    };
    const high = {
      mimeType: 'video/H264',
      parameters: { 'profile-level-id': '640032' },
    };

    expect(pickH264Codec([constrained, high], '640032')).toBe(high);
    expect(pickH264Codec([constrained, high], null)).toBe(constrained);
    expect(pickH264Codec([constrained], '640032')).toBe(constrained);
    expect(pickH264Codec([high], null)).toBe(high);
  });
});

describe('resolveDefaultVideoCodec', () => {
  beforeEach(() => {
    clearHardwareEncoderCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearHardwareEncoderCache();
  });

  it('picks hardware AV1 for the 16:9 probe of the dialog height', async () => {
    const encodingInfo = vi.fn(
      async (config: { video: { contentType: string } }) => ({
        supported: true,
        powerEfficient: config.video.contentType === 'video/AV1',
      }),
    );
    vi.stubGlobal('navigator', { mediaCapabilities: { encodingInfo } });

    await expect(
      resolveDefaultVideoCodec({
        available: ['av1', 'h264', 'vp9', 'vp8'],
        height: 720,
        fps: 30,
        bitrateKbps: 2500,
      }),
    ).resolves.toEqual({ codec: 'av1', hardwareCodec: 'av1' });
    expect(encodingInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        video: expect.objectContaining({ width: 1280, height: 720 }),
      }),
    );
  });

  it('does not mark the only software codec as hardware', async () => {
    vi.stubGlobal('navigator', {
      mediaCapabilities: {
        encodingInfo: async () => ({
          supported: true,
          powerEfficient: false,
        }),
      },
    });

    await expect(
      resolveDefaultVideoCodec({
        available: ['h264'],
        height: 720,
        fps: 30,
        bitrateKbps: 2500,
      }),
    ).resolves.toEqual({ codec: 'h264', hardwareCodec: null });
  });
});
