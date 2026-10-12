import type { TDesktopHotkeys } from '@konvoez/shared';
import type { TLanguage } from './i18n';

export type THotkeyStatus = 'ok' | 'conflict' | 'invalid' | 'unset';

export interface ISerializableSource {
  id: string;
  name: string;
  thumbnailUrl: string;
  appIconUrl: string | null;
}

export interface IServerDialogInitial {
  serverOrigin: string | null;
  locale: TLanguage;
}

export interface ISettingsDialogInitial {
  hotkeys: TDesktopHotkeys;
  autostart: boolean;
  locale: TLanguage;
}

export interface ISourcePickerDialogInitial {
  sources: ISerializableSource[];
  shareAudio: boolean;
  audioSupported: boolean;
  locale: TLanguage;
}

export interface IServerDialogAdapter {
  getInitial(): Promise<IServerDialogInitial>;
  saveServer(url: string): Promise<{ origin: string }>;
}

export interface ISettingsDialogAdapter {
  getInitial(): Promise<ISettingsDialogInitial>;
  save(p: {
    hotkeys: TDesktopHotkeys;
    autostart: boolean;
  }): Promise<{ hotkeys: Record<keyof TDesktopHotkeys, THotkeyStatus> }>;
  suspendHotkeys(): void;
  resumeHotkeys(): void;
}

export interface ISourcePickerDialogAdapter {
  getInitial(): Promise<ISourcePickerDialogInitial>;
  setShareAudio(value: boolean): void;
  pick(sourceId: string | null, withAudio: boolean): void;
}

export interface IKonvoezLocalBridge {
  server: IServerDialogAdapter;
  settings: ISettingsDialogAdapter;
  picker: ISourcePickerDialogAdapter;
}
