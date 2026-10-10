import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopCapturerSource, Session } from 'electron';
import {
  getScreenShareAudio,
  installDisplayMediaHandler,
  isPickerOpen,
  openSourcePicker,
  resetPickerOpenForTests,
  serializeCapturerSources,
} from './display-media';

vi.mock('electron', () => {
  class MockBrowserWindow {
    removeMenu = vi.fn();
    loadFile = vi.fn();
    isDestroyed = vi.fn().mockReturnValue(false);
    close = vi.fn();
    on = vi.fn();
    once = vi.fn();
    show = vi.fn();
  }

  return {
    BrowserWindow: MockBrowserWindow,
    desktopCapturer: {
      getSources: vi.fn(),
    },
    ipcMain: {
      handle: vi.fn(),
      removeHandler: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
    },
    nativeImage: {
      createFromPath: vi.fn(),
    },
  };
});

describe('display-media helpers', () => {
  describe('getScreenShareAudio', () => {
    it('returns loopback on win32', () => {
      expect(getScreenShareAudio('win32')).toBe('loopback');
    });

    it('returns undefined on linux and darwin', () => {
      expect(getScreenShareAudio('linux')).toBeUndefined();
      expect(getScreenShareAudio('darwin')).toBeUndefined();
    });
  });

  describe('serializeCapturerSources', () => {
    it('serializes native images to data URLs', () => {
      const mockSources = [
        {
          id: 'screen:0:0',
          name: 'Entire Screen',
          thumbnail: { toDataURL: () => 'data:image/png;base64,screen-thumb' },
          appIcon: null,
        },
        {
          id: 'window:1234:0',
          name: 'Visual Studio Code',
          thumbnail: { toDataURL: () => 'data:image/png;base64,window-thumb' },
          appIcon: { toDataURL: () => 'data:image/png;base64,app-icon' },
        },
      ] as unknown as DesktopCapturerSource[];

      const result = serializeCapturerSources(mockSources);
      expect(result).toEqual([
        {
          id: 'screen:0:0',
          name: 'Entire Screen',
          thumbnailUrl: 'data:image/png;base64,screen-thumb',
          appIconUrl: null,
        },
        {
          id: 'window:1234:0',
          name: 'Visual Studio Code',
          thumbnailUrl: 'data:image/png;base64,window-thumb',
          appIconUrl: 'data:image/png;base64,app-icon',
        },
      ]);
    });
  });

  describe('concurrent picker guard', () => {
    beforeEach(() => {
      resetPickerOpenForTests();
    });

    afterEach(() => {
      resetPickerOpenForTests();
    });

    it('defaults to picker closed', () => {
      expect(isPickerOpen()).toBe(false);
    });

    it('openSourcePicker returns null immediately when picker is already open', async () => {
      void openSourcePicker([], null);
      expect(isPickerOpen()).toBe(true);

      const result = await openSourcePicker([], null);
      expect(result).toBeNull();
    });

    type DisplayMediaHandler = (
      request: { securityOrigin: string },
      callback: (response: Record<string, unknown>) => void,
    ) => Promise<void>;

    it('installDisplayMediaHandler rejects origin mismatch with callback({})', async () => {
      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      expect(handler).toBeDefined();

      const callback = vi.fn();
      await handler({ securityOrigin: 'https://evil.com' }, callback);
      expect(callback).toHaveBeenCalledWith({});
    });

    it('installDisplayMediaHandler rejects immediately when picker is open', async () => {
      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
      );

      void openSourcePicker([], null);
      expect(isPickerOpen()).toBe(true);

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      expect(handler).toBeDefined();

      const callback = vi.fn();
      await handler(
        { securityOrigin: 'https://konvoez.example.com' },
        callback,
      );
      expect(callback).toHaveBeenCalledWith({});
    });
  });
});
