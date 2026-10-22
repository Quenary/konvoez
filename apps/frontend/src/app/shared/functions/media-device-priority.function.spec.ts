import { describe, expect, it } from 'vitest';
import {
  matchPreferredDevice,
  prioritizedDevices,
  resolveMediaDevice,
} from './media-device-priority.function';

const device = (
  kind: MediaDeviceKind,
  deviceId: string,
  label = deviceId,
): MediaDeviceInfo => ({ kind, deviceId, label }) as MediaDeviceInfo;

const windowsInputs = [
  device('audioinput', 'default', 'Default - Headset (USB)'),
  device('audioinput', 'communications', 'Communications - Headset (USB)'),
  device('audioinput', 'headset', 'Headset (USB)'),
  device('audioinput', 'webcam', 'Webcam mic'),
];

describe('media device priority', () => {
  it('matches the stored device by id first', () => {
    expect(
      matchPreferredDevice(windowsInputs, 'audioinput', {
        deviceId: 'webcam',
        label: 'Headset (USB)',
      })?.deviceId,
    ).toBe('webcam');
  });

  it('falls back to a physical device with a similar label', () => {
    expect(
      matchPreferredDevice(windowsInputs, 'audioinput', {
        deviceId: 'stale-id',
        label: 'Headset',
      })?.deviceId,
    ).toBe('headset');
  });

  it('never matches virtual devices by label', () => {
    expect(
      matchPreferredDevice(
        [device('audioinput', 'default', 'Default - Headset')],
        'audioinput',
        { deviceId: 'stale-id', label: 'Headset' },
      ),
    ).toBeNull();
  });

  it('matches a stored virtual device by id only', () => {
    expect(
      matchPreferredDevice(
        [device('audioinput', 'headset', 'Default - Headset')],
        'audioinput',
        { deviceId: 'default', label: 'Default - Headset' },
      ),
    ).toBeNull();
    expect(
      prioritizedDevices(windowsInputs, 'audioinput', {
        deviceId: 'default',
        label: 'Default - Headset (USB)',
      }).map((d) => d.deviceId),
    ).toEqual(['default', 'communications']);
  });

  it('orders user choice, communications, default', () => {
    expect(
      prioritizedDevices(windowsInputs, 'audioinput', {
        deviceId: 'webcam',
        label: 'Webcam mic',
      }).map((d) => d.deviceId),
    ).toEqual(['webcam', 'communications', 'default']);
  });

  it('uses communications before default without a user choice', () => {
    expect(
      resolveMediaDevice(windowsInputs, 'audioinput', null)?.deviceId,
    ).toBe('communications');
  });

  it('applies the same order to outputs', () => {
    const outputs = [
      device('audiooutput', 'default'),
      device('audiooutput', 'communications'),
      device('audiooutput', 'speakers'),
    ];
    expect(
      prioritizedDevices(outputs, 'audiooutput', {
        deviceId: 'missing',
        label: '',
      }).map((d) => d.deviceId),
    ).toEqual(['communications', 'default']);
  });

  it('uses the chosen camera, then the first camera', () => {
    const cameras = [
      device('videoinput', 'cam-1', 'Built-in'),
      device('videoinput', 'cam-2', 'USB cam'),
    ];
    expect(
      resolveMediaDevice(cameras, 'videoinput', {
        deviceId: 'cam-2',
        label: 'USB cam',
      })?.deviceId,
    ).toBe('cam-2');
    expect(
      resolveMediaDevice(cameras, 'videoinput', {
        deviceId: 'gone',
        label: 'Gone cam',
      })?.deviceId,
    ).toBe('cam-1');
  });

  it('returns null when no device of the kind is listed', () => {
    expect(resolveMediaDevice([], 'videoinput', null)).toBeNull();
  });
});
