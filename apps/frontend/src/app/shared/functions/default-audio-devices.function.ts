import {
  COMMUNICATIONS_DEVICE_ID,
  DEFAULT_DEVICE_ID,
} from './media-device-priority.function';

const pickPreselected = (
  devices: MediaDeviceInfo[],
  kind: MediaDeviceKind,
  preferredDeviceId: string | null,
): MediaDeviceInfo | null => {
  const ofKind = devices.filter((d) => d.kind === kind);
  return (
    ofKind.find((d) => d.deviceId === COMMUNICATIONS_DEVICE_ID) ??
    ofKind.find((d) => d.deviceId === DEFAULT_DEVICE_ID) ??
    (preferredDeviceId
      ? ofKind.find((d) => d.deviceId === preferredDeviceId)
      : undefined) ??
    ofKind[0] ??
    null
  );
};

/**
 * Initial input selection when nothing is chosen yet: `communications`, then
 * `default`, then the device of the active stream (if any), then the first input.
 */
export const pickDefaultAudioInput = (
  devices: MediaDeviceInfo[],
  preferredDeviceId: string | null = null,
): MediaDeviceInfo | null =>
  pickPreselected(devices, 'audioinput', preferredDeviceId);

/**
 * Initial output selection when nothing is chosen yet: `communications`, then
 * `default`, then the first output.
 */
export const pickDefaultAudioOutput = (
  devices: MediaDeviceInfo[],
): MediaDeviceInfo | null => pickPreselected(devices, 'audiooutput', null);
