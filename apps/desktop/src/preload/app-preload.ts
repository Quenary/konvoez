import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_BRIDGE_API_VERSION,
  EDesktopCommand,
  EDesktopIpc,
  type IKonvoezDesktopBridge,
  type TDesktopVoiceState,
  type TPushNotificationPayload,
} from '@konvoez/shared';

function resolveAppVersion(): string {
  const prefix = '--konvoez-version=';
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : '0.0.0';
}

const bridge: IKonvoezDesktopBridge = {
  apiVersion: DESKTOP_BRIDGE_API_VERSION,
  platform: process.platform === 'win32' ? 'win32' : 'linux',
  appVersion: resolveAppVersion(),
  notify: (payload: TPushNotificationPayload) => {
    ipcRenderer.send(EDesktopIpc.NOTIFY, payload);
  },
  setVoiceState: (state: TDesktopVoiceState) => {
    ipcRenderer.send(EDesktopIpc.SET_VOICE_STATE, state);
  },
  quitReady: () => {
    ipcRenderer.send(EDesktopIpc.QUIT_READY);
  },
  onCommand: (listener: (command: EDesktopCommand) => void) => {
    const handler = (_: unknown, command: EDesktopCommand) => listener(command);
    ipcRenderer.on(EDesktopIpc.COMMAND, handler);
    return () => {
      ipcRenderer.removeListener(EDesktopIpc.COMMAND, handler);
    };
  },
};

contextBridge.exposeInMainWorld('konvoezDesktop', bridge);
