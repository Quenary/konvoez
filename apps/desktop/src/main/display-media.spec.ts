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
    MessageChannelMain: class MockMessageChannelMain {
      static lastInstance: MockMessageChannelMain | null = null;
      port1 = {
        postMessage: vi.fn(),
        on: vi.fn(),
        start: vi.fn(),
        close: vi.fn(),
      };
      port2 = {};
      constructor() {
        MockMessageChannelMain.lastInstance = this;
      }
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
    beforeEach(async () => {
      resetPickerOpenForTests();
      const nativeMod = await import('./native');
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue(null);
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

    it('uses native audio capture when available without returning loopback audio to callback', async () => {
      const nativeMod = await import('./native');
      const startAudioCapture = vi.fn().mockReturnValue({ stop: vi.fn() });
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => true,
        isKeyHookSupported: () => false,
        getAudioStreams: () => [],
        startAudioCapture,
        startKeyHook: vi.fn(),
      });

      const { desktopCapturer } = await import('electron');
      const screenSource = {
        id: 'screen:0:0',
        name: 'Screen 0',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValue([screenSource]);

      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      const mockWebContents = { postMessage: vi.fn() };
      const mockMainWindow = {
        isDestroyed: () => false,
        webContents: mockWebContents,
      } as unknown as import('electron').BrowserWindow;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => mockMainWindow,
        null,
        'win32',
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      // Callback does NOT contain audio: 'loopback'
      expect(callback).toHaveBeenCalledWith({ video: screenSource });

      // Transferred MessagePort to window
      expect(mockWebContents.postMessage).toHaveBeenCalledWith(
        'konvoez:screen-audio-port',
        null,
        expect.any(Array),
      );

      // Screen audio captured in exclude mode with current pid
      expect(startAudioCapture).toHaveBeenCalledWith(
        { mode: 'exclude', targetPid: process.pid },
        expect.any(Function),
      );
    });

    it('captures window audio in include mode with window HWND', async () => {
      const nativeMod = await import('./native');
      const startAudioCapture = vi.fn().mockReturnValue({ stop: vi.fn() });
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => true,
        isKeyHookSupported: () => false,
        getAudioStreams: () => [],
        startAudioCapture,
        startKeyHook: vi.fn(),
      });

      const { desktopCapturer } = await import('electron');
      const windowSource = {
        id: 'window:98765:0',
        name: 'Game Window',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValue([windowSource]);

      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      const mockWebContents = { postMessage: vi.fn() };
      const mockMainWindow = {
        isDestroyed: () => false,
        webContents: mockWebContents,
      } as unknown as import('electron').BrowserWindow;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => mockMainWindow,
        null,
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
      expect(startAudioCapture).toHaveBeenCalledWith(
        { mode: 'include', targetHwnd: 98765 },
        expect.any(Function),
      );
    });

    it('does not capture audio if window is Konvoez itself', async () => {
      const nativeMod = await import('./native');
      const startAudioCapture = vi.fn();
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => true,
        isKeyHookSupported: () => false,
        getAudioStreams: () => [],
        startAudioCapture,
        startKeyHook: vi.fn(),
      });

      const { desktopCapturer } = await import('electron');
      const konvoezWindow = {
        id: 'window:1111:0',
        name: 'Konvoez',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValue([konvoezWindow]);

      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => null,
        null,
        'win32',
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      expect(callback).toHaveBeenCalledWith({ video: konvoezWindow });
      expect(startAudioCapture).not.toHaveBeenCalled();
    });

    it('captures specific audio stream when audioStreamId is provided', async () => {
      const nativeMod = await import('./native');
      const startAudioCapture = vi.fn().mockReturnValue({ stop: vi.fn() });
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => true,
        isKeyHookSupported: () => false,
        getAudioStreams: () => [{ id: '42', name: 'Spotify', pid: 1234 }],
        startAudioCapture,
        startKeyHook: vi.fn(),
      });

      const { desktopCapturer, ipcMain } = await import('electron');
      const screen1 = {
        id: 'screen:0:0',
        name: 'Screen 1',
      } as DesktopCapturerSource;
      const screen2 = {
        id: 'screen:1:0',
        name: 'Screen 2',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValue([
        screen1,
        screen2,
      ]);

      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      const mockWebContents = { postMessage: vi.fn() };
      const mockMainWindow = {
        isDestroyed: () => false,
        webContents: mockWebContents,
      } as unknown as import('electron').BrowserWindow;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => mockMainWindow,
        null,
        'linux',
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      const callback = vi.fn();

      const p = handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      await new Promise((r) => setTimeout(r, 10));
      const pickListener = vi
        .mocked(ipcMain.once)
        .mock.calls.find(
          (call) => call[0] === 'konvoez-local:pick-source',
        )?.[1];
      expect(pickListener).toBeDefined();
      pickListener?.({} as never, 'screen:0:0', true, '42');

      await p;

      expect(callback).toHaveBeenCalledWith({ video: screen1 });
      expect(startAudioCapture).toHaveBeenCalledWith(
        { mode: 'include', targetStreamId: '42' },
        expect.any(Function),
      );
    });

    it('posts audio chunks without transfer list and cleans up on port close', async () => {
      const nativeMod = await import('./native');
      const stopCapture = vi.fn();
      let chunkCallback: ((chunk: Buffer) => void) | undefined;
      const startAudioCapture = vi.fn().mockImplementation((_, cb) => {
        chunkCallback = cb;
        return { stop: stopCapture };
      });
      vi.spyOn(nativeMod, 'getNativeModule').mockReturnValue({
        isAudioSupported: () => true,
        isKeyHookSupported: () => false,
        getAudioStreams: () => [],
        startAudioCapture,
        startKeyHook: vi.fn(),
      });

      const { desktopCapturer, MessageChannelMain } = await import('electron');
      const screenSource = {
        id: 'screen:0:0',
        name: 'Screen 1',
      } as DesktopCapturerSource;
      vi.mocked(desktopCapturer.getSources).mockResolvedValue([screenSource]);

      const setDisplayMediaRequestHandler = vi.fn();
      const fakeSession = {
        setDisplayMediaRequestHandler,
      } as unknown as Session;

      const mockWebContents = { postMessage: vi.fn() };
      const mockMainWindow = {
        isDestroyed: () => false,
        webContents: mockWebContents,
      } as unknown as import('electron').BrowserWindow;

      installDisplayMediaHandler(
        fakeSession,
        () => 'https://konvoez.example.com',
        () => mockMainWindow,
        null,
        'win32',
      );

      const handler = setDisplayMediaRequestHandler.mock
        .calls[0]?.[0] as DisplayMediaHandler;
      const callback = vi.fn();

      await handler(
        { securityOrigin: 'https://konvoez.example.com', audioRequested: true },
        callback,
      );

      expect(chunkCallback).toBeDefined();
      const testBuffer = Buffer.from(new Float32Array([0.5, -0.5]).buffer);
      chunkCallback!(testBuffer);

      // Verify postMessage called with single argument (no transfer array)
      const mockChannel = (
        MessageChannelMain as unknown as {
          lastInstance: {
            port1: {
              postMessage: ReturnType<typeof vi.fn>;
              on: ReturnType<typeof vi.fn>;
              close: ReturnType<typeof vi.fn>;
            };
          };
        }
      ).lastInstance;
      expect(mockChannel.port1.postMessage).toHaveBeenCalledWith(
        testBuffer.buffer,
      );

      // Verify port1 handles 'close' event
      const closeListener = mockChannel.port1.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'close',
      )?.[1] as (() => void) | undefined;
      expect(closeListener).toBeDefined();
      closeListener?.();
      expect(stopCapture).toHaveBeenCalled();
      expect(mockChannel.port1.close).toHaveBeenCalled();
    });
  });
});
