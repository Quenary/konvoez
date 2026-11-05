import { contextBridge, ipcRenderer } from 'electron';
import { EDesktopIpc, type TDesktopHotkeys } from '@konvoez/shared';
import type { IKonvoezLocalBridge, TLanguage } from '@konvoez/client-shell';

export type { IKonvoezLocalBridge };

const localBridge: IKonvoezLocalBridge = {
  server: {
    async getInitial() {
      const config = await ipcRenderer.invoke(EDesktopIpc.LOCAL_GET_CONFIG);
      return {
        serverOrigin: config.serverOrigin,
        locale: config.locale as TLanguage,
      };
    },
    async saveServer(url: string) {
      const res = await ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SERVER, url);
      return { origin: res.origin };
    },
  },
  settings: {
    async getInitial() {
      const config = await ipcRenderer.invoke(EDesktopIpc.LOCAL_GET_CONFIG);
      return {
        hotkeys: config.hotkeys,
        autostart: config.autostart,
        nativeHotkeys: Boolean(config.nativeHotkeys),
        locale: config.locale as TLanguage,
      };
    },
    async save(p: { hotkeys: TDesktopHotkeys; autostart: boolean }) {
      const res = await ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SETTINGS, p);
      return { hotkeys: res.hotkeys };
    },
    suspendHotkeys: () => ipcRenderer.send(EDesktopIpc.LOCAL_HOTKEYS_SUSPEND),
    resumeHotkeys: () => ipcRenderer.send(EDesktopIpc.LOCAL_HOTKEYS_RESUME),
  },
  picker: {
    async getInitial() {
      const [config, sourcesData] = await Promise.all([
        ipcRenderer.invoke(EDesktopIpc.LOCAL_GET_CONFIG),
        ipcRenderer.invoke(EDesktopIpc.LOCAL_PICKER_SOURCES),
      ]);
      const sources = Array.isArray(sourcesData)
        ? sourcesData
        : (sourcesData?.sources ?? []);
      const audioStreams = Array.isArray(sourcesData)
        ? undefined
        : sourcesData?.audioStreams;
      return {
        sources,
        shareAudio: config.shareAudio,
        audioSupported: Boolean(config.audioSupported),
        nativeAudio: Boolean(config.nativeAudio),
        locale: config.locale as TLanguage,
        audioStreams,
      };
    },
    setShareAudio: (value: boolean) => {
      void ipcRenderer.invoke(EDesktopIpc.LOCAL_SAVE_SETTINGS, {
        shareAudio: value,
      });
    },
    pick: (
      sourceId: string | null,
      withAudio: boolean,
      audioStreamId?: string,
    ) => {
      ipcRenderer.send(
        EDesktopIpc.LOCAL_PICK_SOURCE,
        sourceId,
        withAudio,
        audioStreamId,
      );
    },
  },
};

contextBridge.exposeInMainWorld('konvoezLocal', localBridge);
