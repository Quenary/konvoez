import { describe, expect, it, vi } from 'vitest';
import type { Notification, BrowserWindow } from 'electron';
import { EDesktopIpc } from '@konvoez/shared';
import { NotificationManager } from './notifications';

describe('NotificationManager', () => {
  it('creates notification and sets up click handler to show main window and send IPC', () => {
    const show = vi.fn();
    const close = vi.fn();
    const listeners: Record<string, () => void> = {};
    const on = vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    });

    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = show;
      close = close;
      on = on;
      constructor(public options: unknown) {}
    }

    const showMainWindow = vi.fn();
    const send = vi.fn();
    const fakeWin = {
      isDestroyed: () => false,
      isMinimized: () => false,
      isVisible: () => true,
      focus: showMainWindow,
      webContents: {
        send,
      },
    } as unknown as BrowserWindow;

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );

    const payload = {
      title: 'Alice',
      body: 'Hello',
      data: { url: '/direct/1' },
    };
    const n = manager.show(payload, fakeWin);

    expect(n).toBeDefined();
    expect(show).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('click', expect.any(Function));

    // Simulate click
    listeners['click']();
    expect(showMainWindow).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(EDesktopIpc.NOTIFICATION_CLICK, payload);
  });

  it('does not send IPC if window is destroyed or null', () => {
    const listeners: Record<string, () => void> = {};
    const on = vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb;
    });

    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = vi.fn();
      close = vi.fn();
      on = on;
      constructor(public options: unknown) {}
    }

    const send = vi.fn();
    const destroyedWin = {
      isDestroyed: () => true,
      webContents: { send },
    } as unknown as BrowserWindow;

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );

    manager.show({ title: 'Alice', body: 'Hello' }, destroyedWin);
    listeners['click']();
    expect(send).not.toHaveBeenCalled();

    manager.show({ title: 'Alice', body: 'Hello' }, null);
    listeners['click']();
    expect(send).not.toHaveBeenCalled();
  });

  it('replaces previous notification with the same tag', () => {
    const firstClose = vi.fn();
    const secondClose = vi.fn();

    let count = 0;
    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = vi.fn();
      close = count++ === 0 ? firstClose : secondClose;
      on = vi.fn();
      constructor(public options: unknown) {}
    }

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );

    manager.show({ title: 'Alice', body: 'Msg 1', tag: 'direct:1' }, null);
    expect(firstClose).not.toHaveBeenCalled();

    manager.show({ title: 'Alice', body: 'Msg 2', tag: 'direct:1' }, null);
    expect(firstClose).toHaveBeenCalledTimes(1);
  });
});
