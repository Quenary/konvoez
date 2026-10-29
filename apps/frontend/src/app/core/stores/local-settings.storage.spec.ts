import { beforeEach, describe, expect, it } from 'vitest';
import { EStorageKey } from '../../app.enums';
import {
  readLocalSettings,
  writeLocalSettings,
} from './local-settings.storage';

describe('local-settings.storage stream fields', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('round-trips extra layers, bitrate and content mode', () => {
    const extra = [{ height: 720, fps: 30 }];
    writeLocalSettings({
      streamExtraLayers: extra,
      streamBitrateKbps: 2500,
      screenExtraLayers: [{ height: 360, fps: 15 }],
      screenBitrateKbps: 4000,
      screenContentMode: 'motion',
    });

    expect(readLocalSettings()).toEqual(
      expect.objectContaining({
        streamExtraLayers: extra,
        streamBitrateKbps: 2500,
        screenExtraLayers: [{ height: 360, fps: 15 }],
        screenBitrateKbps: 4000,
        screenContentMode: 'motion',
      }),
    );
  });

  it('ignores a stored layer count and drops it on the next write', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        streamLayers: 2,
        streamBitrateKbps: 2500,
      }),
    );

    expect(readLocalSettings()).toEqual(
      expect.objectContaining({ streamBitrateKbps: 2500 }),
    );
    expect(readLocalSettings()).not.toHaveProperty('streamLayers');

    writeLocalSettings({ streamBitrateKbps: 2500 });
    const stored = JSON.parse(
      localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['streamLayers']).toBeUndefined();
    expect(stored['streamBitrateKbps']).toBe(2500);
  });

  it('drops invalid stream fields', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        streamExtraLayers: [{ height: 0, fps: 30 }],
        screenExtraLayers: [{ height: 360, fps: 30 }],
      }),
    );
    expect(readLocalSettings().streamExtraLayers).toBeUndefined();

    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ streamBitrateKbps: 10 }),
    );
    expect(readLocalSettings().streamBitrateKbps).toBeUndefined();

    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ screenContentMode: 'cinema' }),
    );
    expect(readLocalSettings().screenContentMode).toBeUndefined();
  });
});
