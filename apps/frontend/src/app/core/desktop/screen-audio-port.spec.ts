import { afterEach, describe, expect, it, vi } from 'vitest';
import { EDesktopIpc, type TScreenAudioMode } from '@konvoez/shared';
import { subscribeScreenAudioPort } from './screen-audio-port';

describe('subscribeScreenAudioPort', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reads every screen-audio message and ignores another origin', () => {
    const listener = vi.fn();
    let messageListener: ((event: MessageEvent) => void) | undefined;
    const port = {
      start: vi.fn(),
      postMessage: vi.fn(),
      close: vi.fn(),
    } as unknown as MessagePort;
    const stopForwarding = vi.fn();
    const host = {
      location: { origin: 'https://konvoez.example' },
      addEventListener: vi.fn((type: string, handler: EventListener) => {
        if (type === 'message') {
          messageListener = handler as (event: MessageEvent) => void;
        }
      }),
      removeEventListener: vi.fn(),
      konvoezDesktop: {
        onScreenAudioPort: vi.fn(() => stopForwarding),
      },
    };
    vi.stubGlobal('window', host);

    const unsubscribe = subscribeScreenAudioPort(listener);
    const deliver = (mode: TScreenAudioMode, transferred?: MessagePort) => {
      messageListener?.({
        source: host,
        origin: host.location.origin,
        data: { channel: EDesktopIpc.SCREEN_AUDIO_PORT, mode },
        ports: transferred ? [transferred] : [],
      } as unknown as MessageEvent);
    };

    deliver('loopback');
    deliver('include', port);
    messageListener?.({
      source: host,
      origin: 'https://evil.example',
      data: { channel: EDesktopIpc.SCREEN_AUDIO_PORT, mode: 'include' },
      ports: [port],
    } as unknown as MessageEvent);

    expect(host.konvoezDesktop.onScreenAudioPort).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, null, 'loopback');
    expect(listener).toHaveBeenNthCalledWith(2, port, 'include');

    unsubscribe();
    expect(host.removeEventListener).toHaveBeenCalledWith(
      'message',
      messageListener,
    );
    expect(stopForwarding).toHaveBeenCalledOnce();
  });

  it('ignores a page that cannot listen for messages', () => {
    const listener = vi.fn();
    vi.stubGlobal('window', {
      konvoezDesktop: {
        onScreenAudioPort: vi.fn(() => () => undefined),
      },
    });

    expect(() => subscribeScreenAudioPort(listener)()).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });
});
