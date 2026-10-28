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

  it('round-trips layers, bitrate and content mode', () => {
    writeLocalSettings({
      streamLayers: 3,
      streamBitrateKbps: 2500,
      screenLayers: 1,
      screenBitrateKbps: 4000,
      screenContentMode: 'motion',
    });

    expect(readLocalSettings()).toEqual(
      expect.objectContaining({
        streamLayers: 3,
        streamBitrateKbps: 2500,
        screenLayers: 1,
        screenBitrateKbps: 4000,
        screenContentMode: 'motion',
      }),
    );
  });

  it('drops invalid stream fields', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        streamLayers: 9,
        streamBitrateKbps: 10,
        screenLayers: 2,
        screenContentMode: 'cinema',
      }),
    );

    const settings = readLocalSettings();
    expect(settings.streamLayers).toBeUndefined();
    expect(settings.streamBitrateKbps).toBeUndefined();
    expect(settings.screenLayers).toBe(2);
    expect(settings.screenContentMode).toBeUndefined();
  });
});
