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
    setMenu = vi.fn();
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
      createFromPath: vi.fn(() => ({ isEmpty: () => false })),
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

    it('handles toDataURL errors gracefully by falling back to empty/null', () => {
      const mockSources = [
        {
          id: 'window:99:0',
          name: 'Broken App',
          thumbnail: {
            toDataURL: () => {
              throw new Error('Native crash');
            },
          },
          appIcon: {
            toDataURL: () => {
              throw new Error('Native icon crash');
            },
          },
        },
      ] as unknown as DesktopCapturerSource[];

      const result = serializeCapturerSources(mockSources);
      expect(result).toEqual([
        {
          id: 'window:99:0',
          name: 'Broken App',
          thumbnailUrl: '',
          appIconUrl: null,
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
      request: { securityOrigin: string; audioRequested?: boolean },
      callback: (response: Record<string, unknown> | null) => void,
    ) => Promise<void>;

    it('installDisplayMediaHandler rejects origin mismatch with callback(null)', async () => {
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
      expect(callback).toHaveBeenCalledWith(null);
    });

    it('installDisplayMediaHandler accepts normalized origin with trailing slash', async () => {
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
      void openSourcePicker([], null); // cause early return after origin match
      await handler(
        { securityOrigin: 'https://konvoez.example.com/' },
        callback,
      );
      expect(callback).toHaveBeenCalledWith(null);
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
      expect(callback).toHaveBeenCalledWith(null);
    });

    it('calls callback(null) when getSources returns empty array', async () => {
      const { desktopCapturer } = await import('electron');
      vi.mocked(desktopCapturer.getSources).mockResolvedValueOnce([]);

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
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com' },
        callback,
      );
      expect(callback).toHaveBeenCalledWith(null);
    });

    it('retries getSources without fetchWindowIcons when icon fetching fails', async () => {
      const { desktopCapturer } = await import('electron');
      const mockSource = {
        id: 'screen:1:0',
        name: 'Screen 1',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources)
        .mockRejectedValueOnce(new Error('Failed to fetch window icons'))
        .mockResolvedValueOnce([mockSource]);

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
      const callback = vi.fn();

      await handler(
        {
          securityOrigin: 'https://konvoez.example.com',
          audioRequested: false,
        },
        callback,
      );

      expect(desktopCapturer.getSources).toHaveBeenCalledTimes(2);
      expect(desktopCapturer.getSources).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ fetchWindowIcons: true }),
      );
      expect(desktopCapturer.getSources).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ fetchWindowIcons: false }),
      );
      expect(callback).toHaveBeenCalledWith({ video: mockSource });
    });

    it('only attaches loopback audio when source is screen and audio was requested', async () => {
      const { desktopCapturer } = await import('electron');
      const windowSource = {
        id: 'window:1:0',
        name: 'Window 1',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValueOnce([
        windowSource,
      ]);

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
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({ video: windowSource });
    });
  });
});
