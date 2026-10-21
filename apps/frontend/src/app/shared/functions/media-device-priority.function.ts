/**
 * Device selection priority shared by capture (getStream), playback sink and camera.
 *
 * 1. The user's choice from settings, matched by id first, then by a similar label.
 * 2. Browser virtual devices for the kind, in order: `communications` (Windows), then `default`.
 * 3. The first available device of the kind (only through {@link resolveMediaDevice}).
 */
export type TPreferredMediaDevice = Pick<MediaDeviceInfo, 'deviceId'> &
  Partial<Pick<MediaDeviceInfo, 'label'>>;

export const COMMUNICATIONS_DEVICE_ID = 'communications';
export const DEFAULT_DEVICE_ID = 'default';

const VIRTUAL_DEVICE_IDS: Record<MediaDeviceKind, readonly string[]> = {
  audioinput: [COMMUNICATIONS_DEVICE_ID, DEFAULT_DEVICE_ID],
  audiooutput: [COMMUNICATIONS_DEVICE_ID, DEFAULT_DEVICE_ID],
  videoinput: [],
};

const ALL_VIRTUAL_IDS = new Set<string>([
  COMMUNICATIONS_DEVICE_ID,
  DEFAULT_DEVICE_ID,
]);

export const normalizeDeviceLabel = (value: string): string =>
  value.toLowerCase().replace(/[^\w]+/g, '');

/**
 * Non-strict match of the stored device: same id, otherwise a physical device
 * whose normalized label contains (or is contained in) the stored label.
 */
export function matchPreferredDevice(
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
  preferred: TPreferredMediaDevice | null | undefined,
): MediaDeviceInfo | null {
  if (!preferred) {
    return null;
  }
  const ofKind = devices.filter((device) => device.kind === kind);
  if (preferred.deviceId) {
    const byId = ofKind.find(
      (device) => device.deviceId === preferred.deviceId,
    );
    if (byId) {
      return byId;
    }
    if (ALL_VIRTUAL_IDS.has(preferred.deviceId)) {
      return null;
    }
  }
  const target = normalizeDeviceLabel(preferred.label ?? '');
  if (!target) {
    return null;
  }
  return (
    ofKind.find((device) => {
      if (ALL_VIRTUAL_IDS.has(device.deviceId)) {
        return false;
      }
      const name = normalizeDeviceLabel(device.label);
      return !!name && (name.includes(target) || target.includes(name));
    }) ?? null
  );
}

/** Ordered, de-duplicated candidates present in `devices` (user choice, communications, default). */
export function prioritizedDevices(
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
  preferred: TPreferredMediaDevice | null | undefined,
): MediaDeviceInfo[] {
  const ofKind = devices.filter((device) => device.kind === kind);
  const result: MediaDeviceInfo[] = [];
  const push = (device: MediaDeviceInfo | null | undefined): void => {
    if (device && !result.some((item) => item.deviceId === device.deviceId)) {
      result.push(device);
    }
  };
  push(matchPreferredDevice(devices, kind, preferred));
  for (const id of VIRTUAL_DEVICE_IDS[kind]) {
    push(ofKind.find((device) => device.deviceId === id));
  }
  return result;
}

/** The device that should be in use right now, or null when none of the kind exists. */
export function resolveMediaDevice(
  devices: readonly MediaDeviceInfo[],
  kind: MediaDeviceKind,
  preferred: TPreferredMediaDevice | null | undefined,
): MediaDeviceInfo | null {
  return (
    prioritizedDevices(devices, kind, preferred)[0] ??
    devices.find((device) => device.kind === kind && !!device.deviceId) ??
    null
  );
}
