import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_BRIDGE_API_VERSION,
  EDesktopCommand,
  EDesktopIpc,
  type IKonvoezDesktopBridge,
  type TScreenAudioMode,
  type TDesktopVoiceState,
  type TPushNotificationPayload,
} from '@konvoez/shared';
import { deliverScreenAudioToRenderer } from './screen-audio-port';

function resolveAppVersion(): string {
  const prefix = '--konvoez-version=';
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '0.0.0';
}

function hasNativeAudio(): boolean {
  return process.argv.includes('--konvoez-native-audio');
}

const bridge: IKonvoezDesktopBridge = {
  apiVersion: DESKTOP_BRIDGE_API_VERSION,
  platform: process.platform === 'win32' ? 'win32' : 'linux',
  appVersion: resolveAppVersion(),
  nativeAudio: hasNativeAudio(),
  notify: (payload: TPushNotificationPayload) => {
    ipcRenderer.send(EDesktopIpc.NOTIFY, payload);
  },
  dismissNotification: (payload: { tag?: string; messageId?: string }) => {
    ipcRenderer.send(EDesktopIpc.DISMISS_NOTIFICATION, payload);
  },
  setVoiceState: (state: TDesktopVoiceState) => {
    ipcRenderer.send(EDesktopIpc.SET_VOICE_STATE, state);
  },
  quitReady: () => {
    ipcRenderer.send(EDesktopIpc.QUIT_READY);
  },
  onScreenAudioPort: () => {
    const handler = (
      event: Electron.IpcRendererEvent,
      mode: TScreenAudioMode,
    ) => {
      deliverScreenAudioToRenderer(
        event.ports?.[0],
        mode ?? 'none',
        (message, targetOrigin, transfer) => {
          window.postMessage(message, targetOrigin, transfer);
        },
        window.location.origin,
      );
    };
    ipcRenderer.on(EDesktopIpc.SCREEN_AUDIO_PORT, handler);
    return () => {
      ipcRenderer.removeListener(EDesktopIpc.SCREEN_AUDIO_PORT, handler);
    };
  },
  onCommand: (listener: (command: EDesktopCommand) => void) => {
    const handler = (_: unknown, command: EDesktopCommand) => listener(command);
    ipcRenderer.on(EDesktopIpc.COMMAND, handler);
    return () => {
      ipcRenderer.removeListener(EDesktopIpc.COMMAND, handler);
    };
  },
  onNotificationClick: (
    listener: (payload: TPushNotificationPayload) => void,
  ) => {
    const handler = (_: unknown, payload: TPushNotificationPayload) =>
      listener(payload);
    ipcRenderer.on(EDesktopIpc.NOTIFICATION_CLICK, handler);
    return () => {
      ipcRenderer.removeListener(EDesktopIpc.NOTIFICATION_CLICK, handler);
    };
  },
};

contextBridge.exposeInMainWorld('konvoezDesktop', bridge);
