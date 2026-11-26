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

  it('closes active notification by tag', () => {
    const close = vi.fn();
    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = vi.fn();
      close = close;
      on = vi.fn();
      constructor(public options: unknown) {}
    }

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );

    manager.show({ title: 'Alice', body: 'Msg 1', tag: 'msg_123' }, null);
    expect(close).not.toHaveBeenCalled();

    manager.close('msg_123');
    expect(close).toHaveBeenCalledTimes(1);

    // Closing a non-existent or already closed tag is safe no-op
    manager.close('msg_123');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closes active notifications by messageId', () => {
    const msgClose = vi.fn();
    const rxClose = vi.fn();

    let count = 0;
    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = vi.fn();
      close = count++ === 0 ? msgClose : rxClose;
      on = vi.fn();
      constructor(public options: unknown) {}
    }

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );

    manager.show(
      {
        title: 'Alice',
        body: 'Msg',
        tag: 'msg_1',
        data: { messageId: 'm-123' },
      },
      null,
    );
    manager.show(
      {
        title: 'Bob',
        body: '👍',
        tag: 'rx_1_2',
        data: { messageId: 'm-123' },
      },
      null,
    );

    manager.closeByMessageId('m-123');
    expect(msgClose).toHaveBeenCalledTimes(1);
    expect(rxClose).toHaveBeenCalledTimes(1);
  });

  it('updates only an active notification and keeps the update silent', () => {
    const instances: Array<{
      options: unknown;
      close: ReturnType<typeof vi.fn>;
    }> = [];
    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = vi.fn();
      close = vi.fn();
      on = vi.fn();
      options: unknown;
      constructor(options: unknown) {
        this.options = options;
        instances.push(this);
      }
    }

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );
    manager.show(
      {
        title: 'Alice',
        body: 'Original message',
        tag: 'msg_existing',
      },
      null,
    );

    const updated = manager.update(
      {
        title: 'Alice',
        body: 'Edited message',
        tag: 'msg_existing',
      },
      null,
    );

    expect(instances[0].close).toHaveBeenCalled();
    expect(updated).toBeDefined();
    expect(instances[1].options).toMatchObject({
      body: 'Edited message',
      silent: true,
    });
    expect(
      manager.update(
        {
          title: 'Alice',
          body: 'No existing notification',
          tag: 'msg_missing',
        },
        null,
      ),
    ).toBeNull();
    expect(instances).toHaveLength(2);
  });

  it('dismisses batched tags and read-through messages but preserves reactions', () => {
    const closes = new Map<string, ReturnType<typeof vi.fn>>();
    const tags = [
      'msg_before',
      'msg_boundary',
      'msg_after',
      'rx_room',
      'msg_other_room',
      'msg_batch',
    ];
    let notificationIndex = 0;
    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = vi.fn();
      close: ReturnType<typeof vi.fn>;
      on = vi.fn();
      constructor() {
        const tag = tags[notificationIndex];
        notificationIndex += 1;
        this.close = vi.fn();
        closes.set(tag, this.close);
      }
    }

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );
    const beforeBoundary = '01a16622-fe1e-74f9-b1a1-9d4158058f0b';
    const boundary = '01a16622-fe1e-74f9-b1a1-9d4158058f0c';
    const afterBoundary = '01a16622-fe1e-74f9-b1a1-9d4158058f0d';
    const notifications = [
      {
        tag: 'msg_before',
        data: { type: 'message', roomId: 10, messageId: beforeBoundary },
      },
      {
        tag: 'msg_boundary',
        data: { type: 'mention', roomId: 10, messageId: boundary },
      },
      {
        tag: 'msg_after',
        data: { type: 'message', roomId: 10, messageId: afterBoundary },
      },
      {
        tag: 'rx_room',
        data: { type: 'reaction', roomId: 10, messageId: beforeBoundary },
      },
      {
        tag: 'msg_other_room',
        data: { type: 'message', roomId: 11, messageId: beforeBoundary },
      },
      {
        tag: 'msg_batch',
        data: {
          type: 'direct-message',
          senderId: 2,
          messageId: beforeBoundary,
        },
      },
    ];
    for (const notification of notifications) {
      manager.show(
        {
          title: 'Alice',
          body: 'Message',
          ...notification,
        },
        null,
      );
    }

    manager.dismiss({ roomId: 10, maxMessageId: boundary });

    expect(closes.get('msg_before')).toHaveBeenCalled();
    expect(closes.get('msg_boundary')).toHaveBeenCalled();
    expect(closes.get('msg_after')).not.toHaveBeenCalled();
    expect(closes.get('rx_room')).not.toHaveBeenCalled();
    expect(closes.get('msg_other_room')).not.toHaveBeenCalled();

    manager.dismiss({ tags: ['msg_batch'] });
    expect(closes.get('msg_batch')).toHaveBeenCalled();
  });

  it('closes only the tagged notification when a dismiss includes both tag and messageId', () => {
    const msgClose = vi.fn();
    const rxClose = vi.fn();

    let count = 0;
    class MockNotification {
      static isSupported = vi.fn().mockReturnValue(true);
      show = vi.fn();
      close = count++ === 0 ? msgClose : rxClose;
      on = vi.fn();
      constructor(public options: unknown) {}
    }

    const manager = new NotificationManager(
      MockNotification as unknown as typeof Notification,
    );

    manager.show(
      {
        title: 'Alice',
        body: 'Msg',
        tag: 'msg_1',
        data: { messageId: 'm-123' },
      },
      null,
    );
    manager.show(
      {
        title: 'Bob',
        body: '👍',
        tag: 'rx_1_2',
        data: { messageId: 'm-123' },
      },
      null,
    );

    manager.dismiss({ tag: 'rx_1_2', messageId: 'm-123' });
    expect(msgClose).not.toHaveBeenCalled();
    expect(rxClose).toHaveBeenCalledTimes(1);
  });
});
