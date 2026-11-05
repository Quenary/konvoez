import { describe, expect, it, vi } from 'vitest';
import { EDesktopIpc, type TScreenAudioMode } from '@konvoez/shared';
import { deliverScreenAudioToRenderer } from './screen-audio-port';

describe('deliverScreenAudioToRenderer', () => {
  it.each(['include', 'exclude'] as const)(
    'transfers a %s port with the page message',
    (mode: TScreenAudioMode) => {
      const port = { start: vi.fn() } as unknown as MessagePort;
      const postMessage = vi.fn();

      deliverScreenAudioToRenderer(
        port,
        mode,
        postMessage,
        'https://konvoez.example',
      );

      expect(postMessage).toHaveBeenCalledWith(
        { channel: EDesktopIpc.SCREEN_AUDIO_PORT, mode },
        'https://konvoez.example',
        [port],
      );
    },
  );

  it.each(['loopback', 'none'] as const)(
    'posts %s without a port',
    (mode: TScreenAudioMode) => {
      const postMessage = vi.fn();

      deliverScreenAudioToRenderer(
        undefined,
        mode,
        postMessage,
        'https://konvoez.example',
      );

      expect(postMessage).toHaveBeenCalledWith(
        { channel: EDesktopIpc.SCREEN_AUDIO_PORT, mode },
        'https://konvoez.example',
        [],
      );
    },
  );
});
