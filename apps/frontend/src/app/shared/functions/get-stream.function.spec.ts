import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStream } from './get-stream.function';

describe('getStream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for echo cancellation without browser noise suppression or AGC', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ id: 'stream' });
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });

    const stream = await getStream({
      deviceId: 'mic-1',
      label: 'Desk mic',
      kind: 'audioinput',
    } as MediaDeviceInfo);

    expect(stream).toEqual({ id: 'stream' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
        deviceId: { exact: 'mic-1' },
      },
    });
  });

  it('uses the same processing constraints for the default device', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ id: 'default' });
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });

    await getStream(null);

    expect(getUserMedia).toHaveBeenCalledWith({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
      },
    });
  });
});
