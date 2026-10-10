import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDesktopCommand, EDesktopIpc } from '@konvoez/shared';
import {
  notifyQuitReady,
  performQuitFlow,
  resetQuittingStateForTests,
} from './quit';
import type { BrowserWindow } from 'electron';

describe('performQuitFlow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetQuittingStateForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    resetQuittingStateForTests();
  });

  it('quits immediately if window is null or destroyed', () => {
    const quitFn = vi.fn();
    performQuitFlow(null, quitFn);
    expect(quitFn).toHaveBeenCalledTimes(1);
  });

  it('sends QUIT_REQUESTED and quits when notifyQuitReady is called before timeout', () => {
    const send = vi.fn();
    const fakeWin = {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;

    const quitFn = vi.fn();
    performQuitFlow(fakeWin, quitFn, 3000);

    expect(send).toHaveBeenCalledWith(
      EDesktopIpc.COMMAND,
      EDesktopCommand.QUIT_REQUESTED,
    );
    expect(quitFn).not.toHaveBeenCalled();

    notifyQuitReady();
    expect(quitFn).toHaveBeenCalledTimes(1);

    // Fast forward to ensure quitFn is not called again
    vi.advanceTimersByTime(4000);
    expect(quitFn).toHaveBeenCalledTimes(1);
  });

  it('quits after timeout if quitReady is never notified', () => {
    const send = vi.fn();
    const fakeWin = {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;

    const quitFn = vi.fn();
    performQuitFlow(fakeWin, quitFn, 3000);

    expect(quitFn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(quitFn).toHaveBeenCalledTimes(1);
  });
});
