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
      cameraExtraLayers: extra,
      cameraBitrateKbps: 2500,
      screenExtraLayers: [{ height: 360, fps: 15 }],
      screenBitrateKbps: 4000,
      screenContentMode: 'motion',
      cameraCodec: 'vp9',
      screenCodec: 'av1',
      cameraSvcMode: 'L3T3_KEY',
      screenSvcMode: 'L1T3',
    });

    expect(readLocalSettings()).toEqual(
      expect.objectContaining({
        cameraExtraLayers: extra,
        cameraBitrateKbps: 2500,
        screenExtraLayers: [{ height: 360, fps: 15 }],
        screenBitrateKbps: 4000,
        screenContentMode: 'motion',
        cameraCodec: 'vp9',
        screenCodec: 'av1',
        cameraSvcMode: 'L3T3_KEY',
        screenSvcMode: 'L1T3',
      }),
    );
  });

  it('ignores a stored layer count and drops it on the next write', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        streamLayers: 2,
        cameraBitrateKbps: 2500,
      }),
    );

    expect(readLocalSettings()).toEqual(
      expect.objectContaining({ cameraBitrateKbps: 2500 }),
    );
    expect(readLocalSettings()).not.toHaveProperty('streamLayers');

    writeLocalSettings({ cameraBitrateKbps: 2500 });
    const stored = JSON.parse(
      localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['streamLayers']).toBeUndefined();
    expect(stored['cameraBitrateKbps']).toBe(2500);
  });

  it('drops invalid stream fields', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        cameraExtraLayers: [{ height: 0, fps: 30 }],
        screenExtraLayers: [{ height: 360, fps: 30 }],
      }),
    );
    expect(readLocalSettings().cameraExtraLayers).toBeUndefined();

    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ cameraBitrateKbps: 10 }),
    );
    expect(readLocalSettings().cameraBitrateKbps).toBeUndefined();

    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ screenContentMode: 'cinema' }),
    );
    expect(readLocalSettings().screenContentMode).toBeUndefined();

    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ cameraSvcMode: 'L9T9' }),
    );
    expect(readLocalSettings().cameraSvcMode).toBeUndefined();

    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ screenSvcMode: 'L2T3_KEY' }),
    );
    expect(readLocalSettings().screenSvcMode).toBe('L2T3_KEY');
  });

  it('ignores previous camera keys and drops them on the next write', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({
        version: 1,
        videoInput: {
          deviceId: 'cam-1',
          kind: 'videoinput',
          label: 'Camera',
          groupId: 'g1',
        },
        streamHeight: 480,
        streamFps: 15,
        streamCodec: 'vp9',
        streamBitrateKbps: 1500,
        streamSvcMode: 'L1T3',
        streamExtraLayers: [{ height: 360, fps: 15 }],
      }),
    );

    const read = readLocalSettings();
    expect(read.version).toBe(1);
    expect(read.cameraInput).toBeUndefined();
    expect(read.cameraHeight).toBeUndefined();
    expect(read.cameraFps).toBeUndefined();
    expect(read.cameraCodec).toBeUndefined();
    expect(read.cameraBitrateKbps).toBeUndefined();
    expect(read.cameraSvcMode).toBeUndefined();
    expect(read.cameraExtraLayers).toBeUndefined();

    writeLocalSettings({});
    const stored = JSON.parse(
      localStorage.getItem(EStorageKey.LOCAL_SETTINGS) ?? '{}',
    ) as Record<string, unknown>;
    expect(stored['version']).toBe(1);
    expect(stored['videoInput']).toBeUndefined();
    expect(stored['streamHeight']).toBeUndefined();
    expect(stored['streamFps']).toBeUndefined();
    expect(stored['streamCodec']).toBeUndefined();
    expect(stored['streamBitrateKbps']).toBeUndefined();
    expect(stored['streamSvcMode']).toBeUndefined();
    expect(stored['streamExtraLayers']).toBeUndefined();
  });

  it('leaves an unversioned h264 choice in place', () => {
    localStorage.setItem(
      EStorageKey.LOCAL_SETTINGS,
      JSON.stringify({ cameraCodec: 'h264' }),
    );

    expect(readLocalSettings().cameraCodec).toBe('h264');
    expect(readLocalSettings().version).toBeUndefined();
  });
});
