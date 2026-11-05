import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDesktopIpc } from '@konvoez/shared';

const mocks = vi.hoisted(() => {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    openLocalModal: vi.fn(),
    getExistingMainWindow: vi.fn(),
    performQuitFlow: vi.fn((_win: unknown, onQuit: () => void) => onQuit()),
    autoUpdater: {
      autoDownload: false,
      autoInstallOnAppQuit: true,
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      downloadUpdate: vi.fn().mockResolvedValue(undefined),
      quitAndInstall: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners[event]) {
          listeners[event] = [];
        }
        listeners[event].push(cb);
      }),
      emit: (event: string, ...args: unknown[]) => {
        listeners[event]?.forEach((cb) => cb(...args));
      },
      clearListeners: () => {
        for (const k of Object.keys(listeners)) {
          delete listeners[k];
        }
      },
    },
    app: {
      isPackaged: true,
      getPath: vi.fn().mockReturnValue('/tmp'),
    },
    appendFileSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
  };
});

vi.mock('node:fs', () => ({
  appendFileSync: mocks.appendFileSync,
  existsSync: mocks.existsSync,
  mkdirSync: mocks.mkdirSync,
}));

vi.mock('electron', () => ({
  app: mocks.app,
}));

vi.mock('electron-updater', () => ({
  autoUpdater: mocks.autoUpdater,
}));

vi.mock('./window', () => ({
  openLocalModal: mocks.openLocalModal,
  getExistingMainWindow: mocks.getExistingMainWindow,
}));

vi.mock('./quit', () => ({
  performQuitFlow: mocks.performQuitFlow,
}));

import {
  _resetUpdaterStateForTesting,
  checkForUpdatesManual,
  closeUpdaterWindow,
  getUpdaterState,
  handleUpdaterDownload,
  handleUpdaterLater,
  handleUpdaterRestart,
  handleUpdaterRetry,
  initUpdater,
  setUpdaterState,
  setUpdaterVoiceActive,
  shouldCheckForUpdates,
  showUpdaterWindow,
} from './updater';

describe('updater module', () => {
  let mockWindow: {
    isDestroyed: ReturnType<typeof vi.fn>;
    isMinimized: ReturnType<typeof vi.fn>;
    isVisible: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
    focus: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    webContents: { send: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.autoUpdater.clearListeners();
    _resetUpdaterStateForTesting();
    mocks.app.isPackaged = true;
    process.env.APPIMAGE = '/test/AppImage';

    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      isMinimized: vi.fn().mockReturnValue(false),
      isVisible: vi.fn().mockReturnValue(true),
      restore: vi.fn(),
      show: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      webContents: {
        send: vi.fn(),
        isDestroyed: vi.fn().mockReturnValue(false),
      },
    };

    mocks.openLocalModal.mockReturnValue(mockWindow as never);
    mocks.getExistingMainWindow.mockReturnValue(null);
  });

  afterEach(() => {
    delete process.env.APPIMAGE;
  });

  describe('shouldCheckForUpdates', () => {
    it('returns false in unpackaged development mode', () => {
      expect(
        shouldCheckForUpdates({
          isPackaged: false,
          platform: 'win32',
        }),
      ).toBe(false);

      expect(
        shouldCheckForUpdates({
          isPackaged: false,
          platform: 'linux',
          appImageEnv: '/path/to/app.AppImage',
        }),
      ).toBe(false);
    });

    it('returns false on Linux when APPIMAGE env is not present', () => {
      expect(
        shouldCheckForUpdates({
          isPackaged: true,
          platform: 'linux',
          appImageEnv: undefined,
        }),
      ).toBe(false);
    });

    it('returns true on Linux when packaged with APPIMAGE', () => {
      expect(
        shouldCheckForUpdates({
          isPackaged: true,
          platform: 'linux',
          appImageEnv: '/home/user/Konvoez.AppImage',
        }),
      ).toBe(true);
    });

    it('returns true on Windows when packaged', () => {
      expect(
        shouldCheckForUpdates({
          isPackaged: true,
          platform: 'win32',
        }),
      ).toBe(true);
    });
  });

  describe('window and state management', () => {
    it('broadcasts state updates to the open updater window', () => {
      showUpdaterWindow();
      setUpdaterState({ status: 'up-to-date' });

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        EDesktopIpc.LOCAL_UPDATER_STATE,
        expect.objectContaining({ status: 'up-to-date' }),
      );
      expect(getUpdaterState().status).toBe('up-to-date');
    });

    it('does not send state when webContents is destroyed', () => {
      showUpdaterWindow();
      mockWindow.webContents.isDestroyed.mockReturnValue(true);
      setUpdaterState({ status: 'up-to-date' });

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('reuses existing window instead of creating a second one', () => {
      const win1 = showUpdaterWindow();
      const win2 = showUpdaterWindow();

      expect(win1).toBe(win2);
      expect(mocks.openLocalModal).toHaveBeenCalledTimes(1);
      expect(mockWindow.focus).toHaveBeenCalled();
    });

    it('restores minimized window on showUpdaterWindow', () => {
      mockWindow.isMinimized.mockReturnValue(true);
      showUpdaterWindow();
      showUpdaterWindow();

      expect(mockWindow.restore).toHaveBeenCalledTimes(1);
    });

    it('opens the updater above the main window without blocking it', () => {
      const mainWindow = {
        isDestroyed: () => false,
        isVisible: () => true,
      };
      mocks.getExistingMainWindow.mockReturnValue(mainWindow as never);

      showUpdaterWindow();

      expect(mocks.openLocalModal).toHaveBeenCalledWith(
        'updater',
        mainWindow,
        expect.objectContaining({ modal: false }),
      );
    });

    it('closeUpdaterWindow closes and clears the window reference', () => {
      showUpdaterWindow();
      closeUpdaterWindow();

      expect(mockWindow.close).toHaveBeenCalledTimes(1);

      // Reopening creates a new window call
      showUpdaterWindow();
      expect(mocks.openLocalModal).toHaveBeenCalledTimes(2);
    });
  });

  describe('manual check flow', () => {
    it('sets state to disabled when running in unpackaged development mode', () => {
      mocks.app.isPackaged = false;
      checkForUpdatesManual();

      expect(getUpdaterState().status).toBe('disabled');
      expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('starts check and sets state to checking when packaged', async () => {
      checkForUpdatesManual();

      expect(getUpdaterState().status).toBe('checking');
      expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('sets state to error on check failure', async () => {
      mocks.autoUpdater.checkForUpdates.mockRejectedValueOnce(
        new Error('Network error'),
      );
      checkForUpdatesManual();
      await Promise.resolve();

      expect(getUpdaterState().status).toBe('error');
      expect(getUpdaterState().error).toBe('updater.checkFailed');
    });
  });

  describe('download and restart actions', () => {
    it('handleUpdaterDownload sets status to downloading and calls autoUpdater', () => {
      handleUpdaterDownload();

      expect(getUpdaterState().status).toBe('downloading');
      expect(getUpdaterState().progress).toEqual({ percent: 0 });
      expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledTimes(1);
    });

    it('handleUpdaterDownload sets error state on failure and opens the window', async () => {
      mocks.autoUpdater.downloadUpdate.mockRejectedValueOnce(
        new Error('Failed download'),
      );
      handleUpdaterDownload();
      await Promise.resolve();

      expect(getUpdaterState().status).toBe('error');
      expect(getUpdaterState().error).toBe('updater.downloadFailed');
      expect(mocks.openLocalModal).toHaveBeenCalledTimes(1);
    });

    it('handleUpdaterLater closes the updater window', () => {
      showUpdaterWindow();
      handleUpdaterLater();

      expect(mockWindow.close).toHaveBeenCalledTimes(1);
    });

    it('handleUpdaterRestart triggers quit and install flow', () => {
      handleUpdaterRestart();

      expect(mocks.performQuitFlow).toHaveBeenCalledTimes(1);
      expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    });

    it('handleUpdaterRetry retries download if last failure was download', async () => {
      mocks.autoUpdater.downloadUpdate.mockRejectedValueOnce(new Error('fail'));
      handleUpdaterDownload();
      await Promise.resolve();
      expect(getUpdaterState().status).toBe('error');

      mocks.autoUpdater.downloadUpdate.mockResolvedValueOnce(undefined);
      handleUpdaterRetry();
      expect(getUpdaterState().status).toBe('downloading');
    });

    it('handleUpdaterRetry retries check if last failure was check', async () => {
      mocks.autoUpdater.checkForUpdates.mockRejectedValueOnce(
        new Error('fail'),
      );
      checkForUpdatesManual();
      await Promise.resolve();
      expect(getUpdaterState().status).toBe('error');

      mocks.autoUpdater.checkForUpdates.mockResolvedValueOnce(undefined);
      handleUpdaterRetry();
      expect(getUpdaterState().status).toBe('checking');
    });
  });

  describe('autoUpdater event integration', () => {
    beforeEach(() => {
      initUpdater();
    });

    it('on update-available sets state to available and opens window', () => {
      mocks.autoUpdater.emit('update-available', { version: '2.5.0' });

      expect(getUpdaterState().status).toBe('available');
      expect(getUpdaterState().version).toBe('2.5.0');
      expect(mocks.openLocalModal).toHaveBeenCalledTimes(1);
    });

    it('on update-not-available updates state to up-to-date if window is open', () => {
      showUpdaterWindow();
      mocks.autoUpdater.emit('update-not-available');

      expect(getUpdaterState().status).toBe('up-to-date');
    });

    it('on download-progress forwards percent and progress info', () => {
      mocks.autoUpdater.emit('download-progress', {
        percent: 63.8,
        bytesPerSecond: 1024 * 512,
        transferred: 1024 * 1024 * 10,
        total: 1024 * 1024 * 16,
      });

      expect(getUpdaterState().status).toBe('downloading');
      expect(getUpdaterState().progress).toEqual({
        percent: 64,
        bytesPerSecond: 1024 * 512,
        transferred: 1024 * 1024 * 10,
        total: 1024 * 1024 * 16,
      });
    });

    it('logs download progress only when a new 10 percent step is reached', () => {
      const emit = (percent: number) => {
        mocks.autoUpdater.emit('download-progress', { percent });
      };
      emit(4);
      emit(9.6);
      emit(10.4);
      emit(14);
      emit(20);
      emit(20.2);
      emit(63.8);
      emit(100);

      const progressPercents = () =>
        mocks.appendFileSync.mock.calls
          .map((call) => String(call[1]))
          .filter((line) => line.includes('Download progress:'))
          .map((line) => line.match(/(\d+)%/)?.[1]);

      expect(progressPercents()).toEqual(['10', '20', '100']);

      handleUpdaterDownload();
      emit(20);
      expect(progressPercents()).toEqual(['10', '20', '100', '20']);
    });

    it('on update-downloaded quits and installs immediately if user is not in voice', () => {
      mocks.autoUpdater.emit('update-downloaded', { version: '2.5.0' });

      expect(mocks.performQuitFlow).toHaveBeenCalledTimes(1);
      expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    });

    it('on update-downloaded defers restart if user is in voice, and prompts after leaving call without auto-quitting', () => {
      setUpdaterVoiceActive(true);
      mocks.autoUpdater.emit('update-downloaded', { version: '2.5.0' });

      // Does not immediately restart
      expect(mocks.performQuitFlow).not.toHaveBeenCalled();
      expect(getUpdaterState().status).toBe('ready-deferred');
      expect(getUpdaterState().version).toBe('2.5.0');

      // User leaves voice call
      setUpdaterVoiceActive(false);

      // Now transitions to ready state and opens prompt, but does NOT auto-quit
      expect(getUpdaterState().status).toBe('ready');
      expect(mocks.openLocalModal).toHaveBeenCalled();
      expect(mocks.performQuitFlow).not.toHaveBeenCalled();
    });

    it('on error sets state to error if updater window is open', () => {
      showUpdaterWindow();
      mocks.autoUpdater.emit('error', new Error('Something went wrong'));

      expect(getUpdaterState().status).toBe('error');
      expect(getUpdaterState().error).toBe('updater.checkFailed');
    });

    it('on download error reopens the window after it was closed', () => {
      setUpdaterState({ status: 'downloading' });
      mocks.autoUpdater.emit('error', new Error('Download failed'));

      expect(getUpdaterState().status).toBe('error');
      expect(getUpdaterState().error).toBe('updater.downloadFailed');
      expect(mocks.openLocalModal).toHaveBeenCalledTimes(1);
    });

    it('on check error leaves the window closed', () => {
      setUpdaterState({ status: 'checking' });
      mocks.autoUpdater.emit('error', new Error('Check failed'));

      expect(getUpdaterState().status).toBe('checking');
      expect(mocks.openLocalModal).not.toHaveBeenCalled();
    });
  });
});
