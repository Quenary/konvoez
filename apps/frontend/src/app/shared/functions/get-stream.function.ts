/**
 * Хелпер для получения стрима с указанного устройства
 * - возвращает стрим с указаного устройства
 * - или возвращает стрим с устройства с похожим именем
 * - или возвращает стрим со стандартного устройства
 *
 * Browser noise suppression and AGC stay off: RNNoise plus the capture
 * compressor own those jobs. Echo cancellation stays on.
 * Looser constraints are retried only after OverconstrainedError or TypeError.
 * NotAllowedError stops the search so Firefox does not prompt again.
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

function errorName(error: unknown): string {
  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return '';
  }
  return typeof error.name === 'string' ? error.name : '';
}

function isConstraintRejection(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    errorName(error) === 'OverconstrainedError' ||
    errorName(error) === 'TypeError'
  );
}

function isPermissionDenied(error: unknown): boolean {
  const name = errorName(error);
  return (
    name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    name === 'PermissionDeniedError'
  );
}

async function openAudio(
  constraints: MediaTrackConstraints | boolean,
): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({ audio: constraints });
}

async function openDevice(deviceId?: string): Promise<MediaStream> {
  try {
    return await openAudio(captureConstraints(deviceId));
  } catch (error) {
    if (!isConstraintRejection(error)) {
      throw error;
    }
    console.warn('getUserMedia rejected capture constraints', error);
    if (!deviceId) {
      return openAudio(true);
    }
    return openAudio({ deviceId: { exact: deviceId } });
  }
}

async function fuzzyDevice(
  device: MediaDeviceInfo,
): Promise<MediaDeviceInfo | null> {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
    const audioInputs = devices.filter((item) => item.kind === 'audioinput');
    const normalize = (value: string) =>
      value.toLowerCase().replace(/[^\w]+/g, '');
    const targetName = normalize(device.label);
    if (!targetName) {
      return null;
    }
    return (
      audioInputs.find((item) => {
        if (item.deviceId === device.deviceId) {
          return false;
        }
        const name = normalize(item.label);
        return name.includes(targetName) || targetName.includes(name);
      }) ?? null
    );
  } catch {
    return null;
  }
}

export async function getStream(
  device: MediaDeviceInfo | null,
): Promise<MediaStream> {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error(
      'MediaDevices API is not available (requires HTTPS or localhost)',
    );
  }

  if (!device) {
    return openDevice();
  }

  try {
    return await openDevice(device.deviceId);
  } catch (error) {
    if (isPermissionDenied(error)) {
      throw error;
    }
    console.warn('getUserMedia failed for the selected device', error);
  }

  const fuzzy = await fuzzyDevice(device);
  if (fuzzy) {
    try {
      return await openDevice(fuzzy.deviceId);
    } catch (error) {
      if (isPermissionDenied(error)) {
        throw error;
      }
      console.warn('getUserMedia failed for a similarly named device', error);
    }
  }

  try {
    return await openDevice();
  } catch (error) {
    if (isPermissionDenied(error)) {
      throw error;
    }
    console.warn('getUserMedia failed for the default device', error);
    throw new Error('Unable to access any audio device', { cause: error });
  }
}
