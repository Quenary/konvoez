/**
 * Хелпер для получения стрима с указанного устройства
 * - возвращает стрим с указаного устройства
 * - или возвращает стрим с устройства с похожим именем
 * - или возвращает стрим со стандартного устройства
 *
 * Browser noise suppression and AGC stay off: RNNoise plus the capture
 * compressor own those jobs. Echo cancellation stays on.
 * @param device
 * @returns
 */
const captureProcessing: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 1 },
};

function captureConstraints(deviceId?: string): MediaTrackConstraints {
  if (!deviceId) {
    return { ...captureProcessing };
  }
  return {
    ...captureProcessing,
    deviceId: { exact: deviceId },
  };
}

export async function getStream(
  device: MediaDeviceInfo | null,
): Promise<MediaStream> {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error(
      'MediaDevices API is not available (requires HTTPS or localhost)',
    );
  }

  const tryGetStream = async (
    constraints: MediaTrackConstraints | boolean,
  ): Promise<MediaStream | null> => {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: constraints,
      });
    } catch (err: unknown) {
      console.warn(
        'getUserMedia failed:',
        err instanceof Error ? err.name : err,
      );
      console.warn(constraints);
      return null;
    }
  };

  // стандартное
  if (!device) {
    const defaultStream =
      (await tryGetStream(captureConstraints())) ?? (await tryGetStream(true));
    if (defaultStream) return defaultStream;
    throw new Error('Unable to access default audio device');
  }

  // точное
  const exactStream =
    (await tryGetStream(captureConstraints(device.deviceId))) ??
    (await tryGetStream({ deviceId: { exact: device.deviceId } }));

  if (exactStream) return exactStream;

  // примерное
  const devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
  const audioInputs = devices.filter((d) => d.kind === 'audioinput');
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w]+/g, '');
  const targetName = normalize(device.label);
  const fuzzyMatch = audioInputs.find((d) => {
    const name = normalize(d.label);
    return name.includes(targetName) || targetName.includes(name);
  });
  if (fuzzyMatch) {
    const fuzzyStream =
      (await tryGetStream(captureConstraints(fuzzyMatch.deviceId))) ??
      (await tryGetStream({ deviceId: { exact: fuzzyMatch.deviceId } }));

    if (fuzzyStream) return fuzzyStream;
  }

  // стандартное
  const defaultStream =
    (await tryGetStream(captureConstraints())) ?? (await tryGetStream(true));
  if (defaultStream) return defaultStream;
  throw new Error('Unable to access any audio device');
}
