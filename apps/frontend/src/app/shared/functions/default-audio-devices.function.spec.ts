import { describe, expect, it } from 'vitest';
import {
  pickDefaultAudioInput,
  pickDefaultAudioOutput,
} from './default-audio-devices.function';

const device = (
  overrides: Partial<MediaDeviceInfo> &
    Pick<MediaDeviceInfo, 'deviceId' | 'kind'>,
): MediaDeviceInfo =>
  ({
    label: overrides.label ?? overrides.deviceId,
    groupId: 'g',
    toJSON() {
      return this;
    },
    ...overrides,
  }) as MediaDeviceInfo;

describe('default-audio-devices', () => {
  it('picks input from preferred device id when present', () => {
    const devices = [
      device({ deviceId: 'default', kind: 'audioinput' }),
      device({ deviceId: 'mic-2', kind: 'audioinput' }),
    ];

    expect(pickDefaultAudioInput(devices, 'mic-2')?.deviceId).toBe('mic-2');
  });

  it('falls back to default then first input', () => {
    const withDefault = [
      device({ deviceId: 'mic-1', kind: 'audioinput' }),
      device({ deviceId: 'default', kind: 'audioinput' }),
    ];
    expect(pickDefaultAudioInput(withDefault)?.deviceId).toBe('default');

    const withoutDefault = [
      device({ deviceId: 'mic-1', kind: 'audioinput' }),
      device({ deviceId: 'mic-2', kind: 'audioinput' }),
    ];
    expect(pickDefaultAudioInput(withoutDefault)?.deviceId).toBe('mic-1');
  });

  it('picks default then first output', () => {
    const devices = [
      device({ deviceId: 'spk-1', kind: 'audiooutput' }),
      device({ deviceId: 'default', kind: 'audiooutput' }),
    ];
    expect(pickDefaultAudioOutput(devices)?.deviceId).toBe('default');
  });

  it('returns null when no devices of the kind exist', () => {
    expect(pickDefaultAudioInput([])).toBeNull();
    expect(pickDefaultAudioOutput([])).toBeNull();
  });
});
