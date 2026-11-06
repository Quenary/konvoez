import {
  EDesktopIpc,
  type IScreenAudioPortMessage,
  type TScreenAudioMode,
} from '@konvoez/shared';
import { getDesktopBridge } from './desktop-bridge';

function isScreenAudioMode(value: unknown): value is TScreenAudioMode {
  return (
    value === 'include' ||
    value === 'exclude' ||
    value === 'loopback' ||
    value === 'none'
  );
}

function isScreenAudioPortMessage(
  value: unknown,
): value is IScreenAudioPortMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('channel' in value) || !('mode' in value)) {
    return false;
  }
  return (
    value.channel === EDesktopIpc.SCREEN_AUDIO_PORT &&
    isScreenAudioMode(value.mode)
  );
}

/**
 * A screen-audio result posted into this page. A port without `start` is a
 * context-bridge copy and is ignored. No port means the mode has no capture.
 */
export function readScreenAudioPort(
  event: MessageEvent,
): { port: MessagePort | null; mode: TScreenAudioMode } | null {
  if (event.source !== window || event.origin !== window.location.origin) {
    return null;
  }
  if (!isScreenAudioPortMessage(event.data)) {
    return null;
  }
  const port = event.ports[0];
  if (port && typeof port.start !== 'function') {
    return null;
  }
  return { port: port ?? null, mode: event.data.mode };
}

/** Screen-audio results arrive only through `window.postMessage`. */
export function subscribeScreenAudioPort(
  listener: (port: MessagePort | null, mode: TScreenAudioMode) => void,
): () => void {
  const onMessage = (event: MessageEvent): void => {
    const delivered = readScreenAudioPort(event);
    if (!delivered) {
      return;
    }
    listener(delivered.port, delivered.mode);
  };

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('message', onMessage);
  }

  const unsubscribe =
    getDesktopBridge()?.onScreenAudioPort?.() ?? (() => undefined);

  return () => {
    if (typeof window.removeEventListener === 'function') {
      window.removeEventListener('message', onMessage);
    }
    unsubscribe();
  };
}
