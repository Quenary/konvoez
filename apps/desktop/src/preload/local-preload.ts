import { contextBridge, ipcRenderer } from 'electron';
import { EDesktopIpc, type TDesktopHotkeys } from '@konvoez/shared';
import type {
  IKonvoezLocalBridge,
  ISerializableSource,
  TLanguage,
} from '@konvoez/client-shell';

export type { IKonvoezLocalBridge };

const localBridge: IKonvoezLocalBridge = {
  async getInitial() {
    const config = await ipcRenderer.invoke(EDesktopIpc.LOCAL_GET_CONFIG);
    let sources: ISerializableSource[] = [];
    try {
      sources =
        (await ipcRenderer.invoke(EDesktopIpc.LOCAL_PICKER_SOURCES)) ?? [];
    } catch {
      // not in picker window
    }
    return {
      serverOrigin: config.serverOrigin,
      hotkeys: config.hotkeys,
      autostart: config.autostart,
      locale: config.locale as TLanguage,
      shareAudio: config.shareAudio,
      audioSupported: Boolean(config.audioSupported),
      sources,
    };
  },

  async saveServer(url: string) {
    const res = await ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SERVER, url);
    return { origin: res.origin };
  },

  async save(p: { hotkeys: TDesktopHotkeys; autostart: boolean }) {
    const res = await ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SETTINGS, p);
    return { hotkeys: res.hotkeys };
  },
  suspendHotkeys: () => ipcRenderer.send(EDesktopIpc.LOCAL_HOTKEYS_SUSPEND),
  resumeHotkeys: () => ipcRenderer.send(EDesktopIpc.LOCAL_HOTKEYS_RESUME),

  setShareAudio: (value: boolean) => {
    void ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SETTINGS, {
      shareAudio: value,
    });
  },
  pick: (sourceId: string | null, withAudio: boolean) => {
    ipcRenderer.send(EDesktopIpc.LOCAL_PICK_SOURCE, sourceId, withAudio);
  },

  getConfig: () => ipcRenderer.invoke(EDesktopIpc.LOCAL_GET_CONFIG),
  testServer: (url: string) =>
    ipcRenderer.invoke(EDesktopIpc.LOCAL_TEST_SERVER, url),
  saveSettings: (params) =>
    ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SETTINGS, params),
  getPickerSources: () => ipcRenderer.invoke(EDesktopIpc.LOCAL_PICKER_SOURCES),
  pickSource: (sourceId: string | null, withAudio?: boolean) =>
    ipcRenderer.send(EDesktopIpc.LOCAL_PICK_SOURCE, sourceId, withAudio),
};

contextBridge.exposeInMainWorld('konvoezLocal', localBridge);
