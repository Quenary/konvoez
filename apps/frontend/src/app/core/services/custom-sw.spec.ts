import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const workerPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../public/custom-sw.js',
);

const earlierId = '01a16622-fe1e-74f9-b1a1-9d4158058f0b';
const boundaryId = '01a16622-fe1e-74f9-b1a1-9d4158058f0c';
const laterId = '01a16622-fe1e-74f9-b1a1-9d4158058f0d';

interface PushBody {
  json: () => unknown;
  text: () => string;
  reads: number;
}

interface FakeNotification {
  tag: string;
  data?: unknown;
  close: ReturnType<typeof vi.fn>;
}

interface PushEvent {
  data: PushBody | null;
  stopImmediatePropagation: ReturnType<typeof vi.fn>;
  waitUntil: (promise: Promise<unknown>) => void;
}

interface ServiceWorkerHarness {
  startupOrder: string[];
  importScripts: ReturnType<typeof vi.fn>;
  getNotifications: ReturnType<typeof vi.fn>;
  showNotification: ReturnType<typeof vi.fn>;
  notifications: FakeNotification[];
  createData: (raw: string) => PushBody;
  dispatch: (data: PushBody | null) => Promise<PushEvent>;
  push: (payload: unknown) => Promise<PushEvent>;
}

class OneShotPushMessageData implements PushBody {
  reads = 0;

  constructor(private readonly raw: string) {}

  json(): unknown {
    this.consume();
    return JSON.parse(this.raw);
  }

  text(): string {
    this.consume();
    return this.raw;
  }

  private consume(): void {
    this.reads += 1;
    if (this.reads > 1) {
      throw new Error('body already consumed');
    }
  }
}

class LockedPushMessageData extends OneShotPushMessageData {
  constructor(raw: string) {
    super(raw);
    const cachedJson = LockedPushMessageData.prototype.json;
    Object.defineProperty(this, 'json', {
      configurable: true,
      get: () => cachedJson,
      set() {
        throw new TypeError('cannot replace json');
      },
    });
  }
}

class UnpatchablePushMessageData implements PushBody {
  reads = 0;

  constructor(private readonly raw: string) {
    Object.defineProperty(this, 'json', {
      configurable: true,
      writable: true,
      value: () => {
        this.reads += 1;
        if (this.reads > 1) {
          throw new Error('body already consumed');
        }
        return JSON.parse(this.raw);
      },
    });
    Object.defineProperty(this, 'text', {
      configurable: true,
      writable: true,
      value: () => this.raw,
    });
  }

  json(): unknown {
    throw new Error('prototype json should not run');
  }

  text(): string {
    return this.raw;
  }
}

Object.defineProperty(UnpatchablePushMessageData.prototype, 'json', {
  configurable: true,
  get() {
    return function json(): unknown {
      throw new Error('prototype json should not run');
    };
  },
  set() {
    throw new TypeError('cannot patch PushMessageData.json');
  },
});

function loadServiceWorker(
  PushMessageData: new (raw: string) => PushBody = OneShotPushMessageData,
): ServiceWorkerHarness {
  const startupOrder: string[] = [];
  const listeners: Array<(event: PushEvent) => void> = [];
  const notifications: FakeNotification[] = [];
  const importScripts = vi.fn((url: string) => {
    startupOrder.push(`import:${url}`);
  });
  const getNotifications = vi.fn(() => Promise.resolve(notifications));
  const showNotification = vi.fn(() => Promise.resolve());

  const context = vm.createContext({
    PushMessageData,
    importScripts,
    self: {
      addEventListener: (
        type: string,
        listener: (event: PushEvent) => void,
      ) => {
        startupOrder.push(`listen:${type}`);
        if (type === 'push') {
          listeners.push(listener);
        }
      },
      registration: {
        getNotifications,
        showNotification,
      },
    },
  });
  vm.runInContext(readFileSync(workerPath, 'utf8'), context);

  return {
    startupOrder,
    importScripts,
    getNotifications,
    showNotification,
    notifications,
    createData: (raw) => new PushMessageData(raw),
    dispatch: async (data) => {
      const waits: Array<Promise<unknown>> = [];
      const event: PushEvent = {
        data,
        stopImmediatePropagation: vi.fn(),
        waitUntil: (promise) => {
          waits.push(Promise.resolve(promise));
        },
      };
      for (const listener of listeners) {
        listener(event);
      }
      await Promise.all(waits);
      return event;
    },
    push(payload) {
      return this.dispatch(this.createData(JSON.stringify(payload)));
    },
  };
}

function notification(tag: string, data?: unknown): FakeNotification {
  return { tag, data, close: vi.fn() };
}

const dismissCases = [
  {
    name: 'closes a notification with the same tag',
    payload: { action: 'dismiss', tag: 'msg_1' },
    shown: { tag: 'msg_1', data: { messageId: 'other' } },
    closes: true,
  },
  {
    name: 'keeps a notification with a different tag',
    payload: { action: 'dismiss', tag: 'msg_1' },
    shown: { tag: 'msg_2', data: { messageId: 'm-1' } },
    closes: false,
  },
  {
    name: 'closes a notification whose tag is in the batch',
    payload: { action: 'dismiss', tags: ['msg_2', 'msg_3'] },
    shown: { tag: 'msg_2' },
    closes: true,
  },
  {
    name: 'keeps a notification whose tag is outside the batch',
    payload: { action: 'dismiss', tags: ['msg_2'], messageId: 'm-1' },
    shown: { tag: 'msg_9', data: { messageId: 'm-1' } },
    closes: false,
  },
  {
    name: 'closes a notification with the same message id',
    payload: { action: 'dismiss', messageId: 'm-1' },
    shown: { tag: 'msg_1', data: { messageId: 'm-1' } },
    closes: true,
  },
  {
    name: 'closes a room message at the read boundary',
    payload: { action: 'dismiss', roomId: 10, maxMessageId: boundaryId },
    shown: {
      tag: 'msg_boundary',
      data: { type: 'message', roomId: 10, messageId: boundaryId },
    },
    closes: true,
  },
  {
    name: 'closes a room message id written without hyphens',
    payload: { action: 'dismiss', roomId: 10, maxMessageId: boundaryId },
    shown: {
      tag: 'msg_plain',
      data: {
        type: 'message',
        roomId: 10,
        messageId: boundaryId.replaceAll('-', ''),
      },
    },
    closes: true,
  },
  {
    name: 'closes a room message id that differs only by case',
    payload: { action: 'dismiss', roomId: 10, maxMessageId: boundaryId },
    shown: {
      tag: 'msg_upper',
      data: {
        type: 'message',
        roomId: 10,
        messageId: boundaryId.toUpperCase(),
      },
    },
    closes: true,
  },
  {
    name: 'keeps a room message after the read boundary',
    payload: { action: 'dismiss', roomId: 10, maxMessageId: boundaryId },
    shown: {
      tag: 'msg_later',
      data: { type: 'message', roomId: 10, messageId: laterId },
    },
    closes: false,
  },
  {
    name: 'keeps a message from another room',
    payload: { action: 'dismiss', roomId: 10, maxMessageId: boundaryId },
    shown: {
      tag: 'msg_other_room',
      data: { type: 'message', roomId: 11, messageId: earlierId },
    },
    closes: false,
  },
  {
    name: 'keeps a reaction in the same room',
    payload: { action: 'dismiss', roomId: 10, maxMessageId: boundaryId },
    shown: {
      tag: 'rx_1',
      data: { type: 'reaction', roomId: 10, messageId: earlierId },
    },
    closes: false,
  },
  {
    name: 'closes a direct message from the recipient up to the boundary',
    payload: {
      action: 'dismiss',
      recipientId: 20,
      maxMessageId: boundaryId,
    },
    shown: {
      tag: 'msg_dm',
      data: {
        type: 'direct-message',
        senderId: 20,
        messageId: earlierId,
      },
    },
    closes: true,
  },
  {
    name: 'keeps a direct message from someone else',
    payload: {
      action: 'dismiss',
      recipientId: 20,
      maxMessageId: boundaryId,
    },
    shown: {
      tag: 'msg_dm_other',
      data: {
        type: 'direct-message',
        senderId: 21,
        messageId: earlierId,
      },
    },
    closes: false,
  },
  {
    name: 'keeps a room message when the dismissal only names a recipient',
    payload: {
      action: 'dismiss',
      recipientId: 20,
      maxMessageId: boundaryId,
    },
    shown: {
      tag: 'msg_room',
      data: { type: 'message', roomId: 10, messageId: earlierId },
    },
    closes: false,
  },
  {
    name: 'keeps a message id that is not a uuid',
    payload: { action: 'dismiss', roomId: 10, maxMessageId: boundaryId },
    shown: {
      tag: 'msg_bad',
      data: { type: 'message', roomId: 10, messageId: 'not-a-uuid' },
    },
    closes: false,
  },
  {
    name: 'closes a listed tag even when the message is past the boundary',
    payload: {
      action: 'dismiss',
      tags: ['msg_late'],
      roomId: 10,
      maxMessageId: boundaryId,
    },
    shown: {
      tag: 'msg_late',
      data: { type: 'message', roomId: 10, messageId: laterId },
    },
    closes: true,
  },
] satisfies Array<{
  name: string;
  payload: Record<string, unknown>;
  shown: { tag: string; data?: unknown };
  closes: boolean;
}>;

describe('custom service worker', () => {
  it('registers the push listener before ngsw', () => {
    const worker = loadServiceWorker();

    expect(worker.startupOrder).toEqual([
      'listen:push',
      'import:./ngsw-worker.js',
    ]);
    expect(worker.importScripts).toHaveBeenCalledTimes(1);
    expect(worker.importScripts).toHaveBeenCalledWith('./ngsw-worker.js');
  });

  it('keeps a displayed notification readable for ngsw', async () => {
    const worker = loadServiceWorker();
    const body = worker.createData('{ "title": "Alice", "body": "Hello" }');

    const event = await worker.dispatch(body);

    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(worker.getNotifications).not.toHaveBeenCalled();
    expect(body.reads).toBe(1);
    expect(body.json()).toEqual({ title: 'Alice', body: 'Hello' });
    expect(body.text()).toBe('{"title":"Alice","body":"Hello"}');
    expect(body.reads).toBe(1);
  });

  it('ignores a push without data', async () => {
    const worker = loadServiceWorker();

    const event = await worker.dispatch(null);

    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(worker.getNotifications).not.toHaveBeenCalled();
  });

  it('ignores a push whose body is not json', async () => {
    const worker = loadServiceWorker();
    const body = worker.createData('not json');

    const event = await worker.dispatch(body);

    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(worker.getNotifications).not.toHaveBeenCalled();
    expect(() => body.json()).toThrow('body already consumed');
  });

  it('ignores a json null body after keeping it readable', async () => {
    const worker = loadServiceWorker();
    const body = worker.createData('null');

    const event = await worker.dispatch(body);

    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(body.json()).toBeNull();
    expect(body.text()).toBe('null');
    expect(body.reads).toBe(1);
  });

  it('restores the body on the event when PushMessageData cannot be patched', async () => {
    const worker = loadServiceWorker(UnpatchablePushMessageData);
    const body = worker.createData('{ "title": "Alice" }');

    const event = await worker.dispatch(body);

    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(body.reads).toBe(1);
    expect(body.json()).toEqual({ title: 'Alice' });
    expect(body.text()).toBe('{"title":"Alice"}');
    expect(body.reads).toBe(1);
  });

  it('serves the cached json when the event body methods cannot be replaced', async () => {
    const worker = loadServiceWorker(LockedPushMessageData);
    const body = worker.createData('{"title":"Alice"}');

    const event = await worker.dispatch(body);

    expect(event.data?.json()).toEqual({ title: 'Alice' });
    expect(body.reads).toBe(1);
    expect(() => body.text()).toThrow('body already consumed');
  });

  it('closes the read boundary and listed tags together', async () => {
    const worker = loadServiceWorker();
    const earlier = notification('msg_1', {
      type: 'message',
      roomId: 10,
      messageId: earlierId,
    });
    const boundary = notification('msg_2', {
      type: 'message',
      roomId: 10,
      messageId: boundaryId,
    });
    const reaction = notification('rx_1', {
      type: 'reaction',
      roomId: 10,
      messageId: earlierId,
    });
    const later = notification('msg_3', {
      type: 'message',
      roomId: 10,
      messageId: laterId,
    });
    const batch = notification('msg_batch', {
      type: 'direct-message',
      senderId: 20,
      messageId: earlierId,
    });
    worker.notifications.push(earlier, boundary, reaction, later, batch);

    const event = await worker.push({
      action: 'dismiss',
      roomId: 10,
      maxMessageId: boundaryId,
      tags: ['msg_batch'],
    });

    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(earlier.close).toHaveBeenCalledOnce();
    expect(boundary.close).toHaveBeenCalledOnce();
    expect(reaction.close).not.toHaveBeenCalled();
    expect(later.close).not.toHaveBeenCalled();
    expect(batch.close).toHaveBeenCalledOnce();
    expect(worker.showNotification).not.toHaveBeenCalled();
  });

  it.each(dismissCases)('$name', async ({ payload, shown, closes }) => {
    const worker = loadServiceWorker();
    const target = notification(shown.tag, shown.data);
    const untouched = notification('untouched', {
      type: 'message',
      roomId: 99,
      messageId: 'untouched-message',
    });
    worker.notifications.push(target, untouched);

    const event = await worker.push(payload);

    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(untouched.close).not.toHaveBeenCalled();
    if (closes) {
      expect(target.close).toHaveBeenCalledOnce();
    } else {
      expect(target.close).not.toHaveBeenCalled();
    }
  });

  it('replaces an existing notification silently', async () => {
    const worker = loadServiceWorker();
    const existing = notification('msg_existing');
    worker.notifications.push(existing);
    const data = { type: 'message', roomId: 10, messageId: boundaryId };

    const event = await worker.push({
      action: 'update',
      notification: {
        title: 'Alice',
        body: 'Edited message',
        icon: '/icons/icon-192x192.png',
        tag: 'msg_existing',
        data,
      },
    });

    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(existing.close).not.toHaveBeenCalled();
    expect(worker.showNotification).toHaveBeenCalledWith('Alice', {
      body: 'Edited message',
      icon: '/icons/icon-192x192.png',
      tag: 'msg_existing',
      data,
      silent: true,
    });
  });

  it('shows the updated notification when that tag is not displayed', async () => {
    const worker = loadServiceWorker();
    const data = { type: 'message', roomId: 10, messageId: boundaryId };

    const event = await worker.push({
      action: 'update',
      notification: {
        title: 'Alice',
        body: 'Edited message',
        icon: '/icons/icon-192x192.png',
        tag: 'msg_missing',
        data,
      },
    });

    expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(worker.showNotification).toHaveBeenCalledWith('Alice', {
      body: 'Edited message',
      icon: '/icons/icon-192x192.png',
      tag: 'msg_missing',
      data,
      silent: false,
    });
  });

  it.each([
    {
      name: 'the notification payload is missing',
    },
    {
      name: 'the tag is not a string',
      notification: { title: 'Alice', body: 'Gone', tag: 1 },
    },
  ])(
    'does not show a notification when $name',
    async ({ notification: update }) => {
      const worker = loadServiceWorker();
      const existing = notification('msg_existing');
      worker.notifications.push(existing);

      const event = await worker.push({
        action: 'update',
        notification: update,
      });

      expect(event.stopImmediatePropagation).toHaveBeenCalledOnce();
      expect(existing.close).not.toHaveBeenCalled();
      expect(worker.showNotification).not.toHaveBeenCalled();
    },
  );
});
