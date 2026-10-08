import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStream } from './get-stream.function';

function mediaError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

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

  it('does not ask again after permission is denied', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(mediaError('NotAllowedError'));
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
        enumerateDevices: vi.fn(),
      },
    });

    await expect(
      getStream({
        deviceId: 'mic-1',
        label: 'Desk mic',
        kind: 'audioinput',
      } as MediaDeviceInfo),
    ).rejects.toThrow('NotAllowedError');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('retries without processing constraints when the browser rejects them', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(mediaError('OverconstrainedError'))
      .mockResolvedValueOnce({ id: 'stream' });
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });

    const stream = await getStream({
      deviceId: 'mic-1',
      label: 'Desk mic',
      kind: 'audioinput',
    } as MediaDeviceInfo);

    expect(stream).toEqual({ id: 'stream' });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { exact: 'mic-1' } },
    });
  });

  it('does not relax constraints after NotFoundError, then tries the default device', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(mediaError('NotFoundError'))
      .mockResolvedValueOnce({ id: 'default' });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });

    const stream = await getStream({
      deviceId: 'mic-1',
      label: 'Desk mic',
      kind: 'audioinput',
    } as MediaDeviceInfo);

    expect(stream).toEqual({ id: 'default' });
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenNthCalledWith(2, {
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: { ideal: 1 },
      },
    });
  });

  it('relaxes the default device only after TypeError', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('bad constraints'))
      .mockResolvedValueOnce({ id: 'default' });
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia },
    });

    await getStream(null);

    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { audio: true });
  });
});
