/**
 * Хелпер для получения стрима с указанного устройства
 * Priority: the user's device (by id, then by similar label), the Windows
 * `communications` device, the `default` device, then no device constraint.
 *
 * Browser noise suppression stays off by default (WASM denoisers own that job).
 * Echo cancellation stays off by default for clean voice capture (enabled manually for speakers).
 * Auto gain control stays off by default: Chromium AGC on Windows can mutate the
 * OS microphone volume via WASAPI. In-app level uses a GainNode only.
 * Looser constraints are retried only after OverconstrainedError or TypeError,
 * and still keep autoGainControl off.
 * NotAllowedError stops the search so Firefox does not prompt again.
 */
import { DEFAULT_ECHO_CANCELLATION } from '../schemas/local-settings.schema';
import {
  matchPreferredDevice,
  prioritizedDevices,
} from './media-device-priority.function';

export interface GetStreamAudioOptions {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  /**
   * Open only the given device (exact id), without the priority fallback.
   * Used by the settings mic test, which must follow the select values.
   */
  strictDevice?: boolean;
}

function captureConstraints(
  deviceId?: string,
  options?: GetStreamAudioOptions,
): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    echoCancellation: options?.echoCancellation ?? DEFAULT_ECHO_CANCELLATION,
    noiseSuppression: options?.noiseSuppression ?? false,
    autoGainControl: options?.autoGainControl ?? false,
    channelCount: { ideal: 1 },
  };

  if (!deviceId) {
    return base;
  }
  return {
    ...base,
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

function relaxedConstraints(
  deviceId: string | undefined,
  options?: GetStreamAudioOptions,
): MediaTrackConstraints {
  // Keep AGC off even when other processing constraints are dropped: Chromium's
  // default for `audio: true` enables AGC and can change the OS mic volume.
  const autoGainControl = options?.autoGainControl ?? false;
  if (!deviceId) {
    return { autoGainControl };
  }
  return { deviceId: { exact: deviceId }, autoGainControl };
}

async function openDevice(
  deviceId?: string,
  options?: GetStreamAudioOptions,
): Promise<MediaStream> {
  try {
    return await openAudio(captureConstraints(deviceId, options));
  } catch (error) {
    if (!isConstraintRejection(error)) {
      throw error;
    }
    console.warn('getUserMedia rejected capture constraints', error);
    return openAudio(relaxedConstraints(deviceId, options));
  }
}

async function listDevices(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices?.()) ?? [];
  } catch {
    return [];
  }
}

/**
 * Device ids to try, in order: the user's device (id, then similar label),
 * `communications`, `default`. When the stored device is not listed (e.g. labels
 * are hidden before permission), its raw id is still tried first.
 */
async function candidateDeviceIds(
  device: MediaDeviceInfo | null,
): Promise<string[]> {
  const devices = await listDevices();
  const ids = prioritizedDevices(devices, 'audioinput', device).map(
    (item) => item.deviceId,
  );
  if (
    device?.deviceId &&
    !matchPreferredDevice(devices, 'audioinput', device)
  ) {
    ids.unshift(device.deviceId);
  }
  return ids.filter((id, index) => !!id && ids.indexOf(id) === index);
}

export async function getStream(
  device: MediaDeviceInfo | null,
  options?: GetStreamAudioOptions,
): Promise<MediaStream> {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error(
      'MediaDevices API is not available (requires HTTPS or localhost)',
    );
  }

  if (options?.strictDevice && device?.deviceId) {
    return openDevice(device.deviceId, options);
  }

  const candidates = await candidateDeviceIds(device);
  for (const deviceId of candidates) {
    try {
      return await openDevice(deviceId, options);
    } catch (error) {
      if (isPermissionDenied(error)) {
        throw error;
      }
      console.warn(`getUserMedia failed for device "${deviceId}"`, error);
    }
  }

  try {
    return await openDevice(undefined, options);
  } catch (error) {
    if (isPermissionDenied(error) || !candidates.length) {
      throw error;
    }
    console.warn('getUserMedia failed for the default device', error);
    throw new Error('Unable to access any audio device', { cause: error });
  }
}
