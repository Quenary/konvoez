import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EDesktopCommand, EDesktopIpc } from '@konvoez/shared';

const mocks = vi.hoisted(() => ({
  openLocalModal: vi.fn(),
  showMainWindow: vi.fn(),
  performQuitFlow: vi.fn(),
  checkForUpdatesManual: vi.fn(),
}));

vi.mock('./window', () => ({
  openLocalModal: mocks.openLocalModal,
  showMainWindow: mocks.showMainWindow,
}));

vi.mock('./quit', () => ({
  performQuitFlow: mocks.performQuitFlow,
}));

vi.mock('./updater', () => ({
  checkForUpdatesManual: mocks.checkForUpdatesManual,
}));

import { runAppAction } from './app-actions';
import type { ConfigStore } from './config-store';

describe('runAppAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggle-mic sends TOGGLE_MIC on win.webContents', () => {
    const send = vi.fn();
    const win = {
      isDestroyed: () => false,
      webContents: { send },
    };

    runAppAction('toggle-mic', {
      win: win as never,
      configStore: {
        get: () => ({ serverOrigin: 'https://x.test' }),
      } as ConfigStore,
    });

    expect(send).toHaveBeenCalledWith(
      EDesktopIpc.COMMAND,
      EDesktopCommand.TOGGLE_MIC,
    );
  });

  it('open without server opens the server modal', () => {
    runAppAction('open', {
      win: null,
      configStore: { get: () => ({ serverOrigin: null }) } as ConfigStore,
    });

    expect(mocks.openLocalModal).toHaveBeenCalledWith('server', null, {
      width: 500,
      height: 400,
    });
    expect(mocks.showMainWindow).not.toHaveBeenCalled();
  });

  it('quit calls performQuitFlow', () => {
    const win = { isDestroyed: () => false } as never;
    runAppAction('quit', {
      win,
      configStore: { get: () => ({ serverOrigin: null }) } as ConfigStore,
    });

    expect(mocks.performQuitFlow).toHaveBeenCalledWith(win);
  });
});
