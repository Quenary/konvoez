import {
  EDesktopIpc,
  type IScreenAudioPortMessage,
  type TScreenAudioMode,
} from '@konvoez/shared';

type TPostScreenAudioPort = (
  message: IScreenAudioPortMessage,
  targetOrigin: string,
  transfer: MessagePort[],
) => void;

/**
 * Post every screen-audio result into the page. A MessagePort cannot cross
 * contextBridge, so the capture port is transferred with the same message.
 */
export function deliverScreenAudioToRenderer(
  port: MessagePort | undefined,
  mode: TScreenAudioMode,
  postMessage: TPostScreenAudioPort,
  origin: string,
): void {
  postMessage(
    { channel: EDesktopIpc.SCREEN_AUDIO_PORT, mode },
    origin,
    port ? [port] : [],
  );
}
