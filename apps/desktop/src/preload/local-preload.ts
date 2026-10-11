import { contextBridge, ipcRenderer } from 'electron';
import { EDesktopIpc, type TDesktopHotkeys } from '@konvoez/shared';

export interface IKonvoezLocalBridge {
  getConfig: () => Promise<{
    serverOrigin: string | null;
    hotkeys: TDesktopHotkeys;
    autostart: boolean;
    locale: string;
  }>;
  testServer: (url: string) => Promise<{ origin: string; version: string }>;
  saveServer: (url: string) => Promise<{ success: boolean; origin: string }>;
  saveSettings: (params: {
    hotkeys: TDesktopHotkeys;
    autostart: boolean;
  }) => Promise<{
    success: boolean;
    hotkeys: Record<string, string>;
    autostart: boolean;
  }>;
  getPickerSources: () => Promise<
    Array<{
      id: string;
      name: string;
      thumbnailUrl: string;
      appIconUrl: string | null;
    }>
  >;
  pickSource: (sourceId: string | null) => void;
  suspendHotkeys: () => void;
  resumeHotkeys: () => void;
}

const localBridge: IKonvoezLocalBridge = {
  getConfig: () => ipcRenderer.invoke(EDesktopIpc.LOCAL_GET_CONFIG),
  testServer: (url: string) =>
    ipcRenderer.invoke(EDesktopIpc.LOCAL_TEST_SERVER, url),
  saveServer: (url: string) =>
    ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SERVER, url),
  saveSettings: (params) =>
    ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SETTINGS, params),
  getPickerSources: () => ipcRenderer.invoke(EDesktopIpc.LOCAL_PICKER_SOURCES),
  pickSource: (sourceId: string | null) =>
    ipcRenderer.send(EDesktopIpc.LOCAL_PICK_SOURCE, sourceId),
  suspendHotkeys: () => ipcRenderer.send(EDesktopIpc.LOCAL_HOTKEYS_SUSPEND),
  resumeHotkeys: () => ipcRenderer.send(EDesktopIpc.LOCAL_HOTKEYS_RESUME),
};

contextBridge.exposeInMainWorld('konvoezLocal', localBridge);
