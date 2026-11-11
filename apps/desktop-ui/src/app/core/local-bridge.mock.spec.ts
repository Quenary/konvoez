import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DESKTOP_UI_LOCAL_BRIDGE_MOCK,
  readLocalBridge,
} from './local-bridge.mock';

describe('local bridge mock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('exposes a marker that production bundles must not contain', () => {
    expect(DESKTOP_UI_LOCAL_BRIDGE_MOCK).toBe('desktop-ui-local-bridge-mock');
  });

  it('returns sample screens, windows and settings without a native host', async () => {
    const bridge = readLocalBridge();
    const picker = await bridge.picker.getInitial();
    const settings = await bridge.settings.getInitial();

    expect(
      picker.sources.filter((source) => source.id.startsWith('screen:')),
    ).toHaveLength(3);
    expect(
      picker.sources.some((source) => source.id.startsWith('window:')),
    ).toBe(true);
    expect(settings.hotkeys.toggleMic).toBeTruthy();
    expect(
      picker.sources[0]?.thumbnailUrl.startsWith('data:image/svg+xml,'),
    ).toBe(true);
  });

  it('moves the updater to ready after download', async () => {
    vi.useFakeTimers();
    const bridge = readLocalBridge();
    bridge.updater.download();

    expect((await bridge.updater.getState()).status).toBe('downloading');

    await vi.advanceTimersByTimeAsync(600);

    expect((await bridge.updater.getState()).status).toBe('ready');
  });
});
