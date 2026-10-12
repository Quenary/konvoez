import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopCapturerSource, Session } from 'electron';
import type { ConfigStore } from './config-store';
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
    isVisible = vi.fn().mockReturnValue(false);
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

    it('attaches loopback audio on win32 for screen when audioRequested and shareAudio are true', async () => {
      const { desktopCapturer } = await import('electron');
      const screenSource = {
        id: 'screen:1:0',
        name: 'Screen 1',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValueOnce([
        screenSource,
      ]);

      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      const fakeConfigStore = {
        get: vi.fn(() => ({ shareAudio: true })),
        set: vi.fn(),
      } as unknown as ConfigStore;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
        fakeConfigStore,
        'win32',
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({
        video: screenSource,
        audio: 'loopback',
      });
    });

    it('attaches loopback audio on win32 for window when audioRequested and shareAudio are true', async () => {
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

      const fakeConfigStore = {
        get: vi.fn(() => ({ shareAudio: true })),
        set: vi.fn(),
      } as unknown as ConfigStore;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
        fakeConfigStore,
        'win32',
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({
        video: windowSource,
        audio: 'loopback',
      });
    });

    it('does not attach loopback audio when shareAudio is false', async () => {
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

      const fakeConfigStore = {
        get: vi.fn(() => ({ shareAudio: false })),
        set: vi.fn(),
      } as unknown as ConfigStore;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
        fakeConfigStore,
        'win32',
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

    it('does not attach loopback audio when platform is not win32', async () => {
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

      const fakeConfigStore = {
        get: vi.fn(() => ({ shareAudio: true })),
        set: vi.fn(),
      } as unknown as ConfigStore;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
        fakeConfigStore,
        'linux',
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

    it('denies an immediate audio:false retry after the user cancelled the picker', async () => {
      resetPickerOpenForTests();
      const { desktopCapturer, ipcMain } = await import('electron');
      const screenA = {
        id: 'screen:1:0',
        name: 'Screen 1',
      } as DesktopCapturerSource;
      const screenB = {
        id: 'screen:2:0',
        name: 'Screen 2',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValue([
        screenA,
        screenB,
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

      void handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      await vi.waitFor(() => {
        expect(
          vi
            .mocked(ipcMain.once)
            .mock.calls.some((call) => call[0] === 'konvoez-local:pick-source'),
        ).toBe(true);
      });

      const handlePick = vi
        .mocked(ipcMain.once)
        .mock.calls.find(
          (call) => call[0] === 'konvoez-local:pick-source',
        )?.[1] as (
        event: unknown,
        id: string | null,
        withAudio?: boolean,
      ) => void;

      handlePick({}, null, true);

      await vi.waitFor(() => {
        expect(callback).toHaveBeenCalledWith(null);
      });

      callback.mockClear();
      vi.mocked(desktopCapturer.getSources).mockClear();

      await handler(
        {
          securityOrigin: 'https://konvoez.example.com',
          audioRequested: false,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith(null);
      expect(desktopCapturer.getSources).not.toHaveBeenCalled();
    });

    it('reuses the last picked video source when audio is not requested (audio fallback retry)', async () => {
      const { desktopCapturer } = await import('electron');
      const screenA = {
        id: 'screen:1:0',
        name: 'Screen 1',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValue([screenA]);

      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      const fakeConfigStore = {
        get: vi.fn(() => ({ shareAudio: true })),
        set: vi.fn(),
      } as unknown as ConfigStore;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
        fakeConfigStore,
        'win32',
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({
        video: screenA,
        audio: 'loopback',
      });

      callback.mockClear();

      await handler(
        {
          securityOrigin: 'https://konvoez.example.com',
          audioRequested: false,
        },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({ video: screenA });
      expect(callback).not.toHaveBeenCalledWith(
        expect.objectContaining({ audio: 'loopback' }),
      );
    });

    it('openSourcePicker saves shareAudio preference to configStore', async () => {
      const { ipcMain } = await import('electron');
      const fakeConfigStore = {
        get: vi.fn(() => ({ shareAudio: true })),
        set: vi.fn(),
      } as unknown as ConfigStore;

      const mockSources = [
        {
          id: 'screen:0',
          name: 'Screen 0',
          thumbnail: { toDataURL: () => '' },
          appIcon: null,
        },
      ] as unknown as DesktopCapturerSource[];

      const promise = openSourcePicker(mockSources, null, fakeConfigStore);

      const handlePick = vi
        .mocked(ipcMain.once)
        .mock.calls.find(
          (call) => call[0] === 'konvoez-local:pick-source',
        )?.[1] as
        | ((event: unknown, id: string | null, withAudio?: boolean) => void)
        | undefined;

      expect(handlePick).toBeDefined();
      handlePick?.({}, 'screen:0', false);

      const result = await promise;
      expect(result).toEqual({
        source: mockSources[0],
        withAudio: false,
      });
      expect(fakeConfigStore.set).toHaveBeenCalledWith({ shareAudio: false });
    });
  });
});
