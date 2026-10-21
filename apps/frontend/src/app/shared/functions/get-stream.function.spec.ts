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

  it('asks for echo cancellation and AGC without browser noise suppression', async () => {
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
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
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
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
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
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
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

  it('tries the chosen device, then communications, then default', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(mediaError('NotFoundError'))
      .mockResolvedValueOnce({ id: 'communications' });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'default', label: 'Default' },
          {
            kind: 'audioinput',
            deviceId: 'communications',
            label: 'Communications',
          },
          { kind: 'audioinput', deviceId: 'usb', label: 'USB mic' },
        ]),
      },
    });

    const stream = await getStream({
      deviceId: 'usb',
      label: 'USB mic',
      kind: 'audioinput',
    } as MediaDeviceInfo);

    expect(stream).toEqual({ id: 'communications' });
    expect(
      getUserMedia.mock.calls.map(
        ([constraints]) =>
          (constraints.audio as { deviceId: { exact: string } }).deviceId.exact,
      ),
    ).toEqual(['usb', 'communications']);
  });

  it('opens a renamed device found by label', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ id: 'usb-2' });
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'audioinput', deviceId: 'default', label: 'Default' },
          { kind: 'audioinput', deviceId: 'usb-2', label: 'USB mic (2)' },
        ]),
      },
    });

    await getStream({
      deviceId: 'usb-1',
      label: 'USB mic',
      kind: 'audioinput',
    } as MediaDeviceInfo);

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(
      (getUserMedia.mock.calls[0][0].audio as { deviceId: { exact: string } })
        .deviceId.exact,
    ).toBe('usb-2');
  });

  it('opens only the given device in strict mode', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(mediaError('NotFoundError'));
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([
        { kind: 'audioinput', deviceId: 'communications', label: 'C' },
      ]);
    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia, enumerateDevices },
    });

    await expect(
      getStream(
        {
          deviceId: 'usb',
          label: 'USB',
          kind: 'audioinput',
        } as MediaDeviceInfo,
        { strictDevice: true },
      ),
    ).rejects.toThrow('NotFoundError');
    expect(enumerateDevices).not.toHaveBeenCalled();
    expect(
      getUserMedia.mock.calls.every(
        ([constraints]) =>
          (constraints.audio as { deviceId: { exact: string } }).deviceId
            .exact === 'usb',
      ),
    ).toBe(true);
  });
});
