import type { TDesktopHotkeys } from '@konvoez/shared';
import type { TLanguage } from './i18n';

export type THotkeyStatus = 'ok' | 'conflict' | 'invalid' | 'unset';

export interface ISerializableSource {
  id: string;
  name: string;
  thumbnailUrl: string;
  appIconUrl: string | null;
}

export interface IAudioStreamInfo {
  id: string;
  name: string;
  pid?: number;
}

export interface IServerDialogInitial {
  serverOrigin: string | null;
  locale: TLanguage;
}

export interface ISettingsDialogInitial {
  hotkeys: TDesktopHotkeys;
  autostart: boolean;
  /** True when hotkeys use the non-blocking native hook instead of `globalShortcut`. */
  nativeHotkeys: boolean;
  locale: TLanguage;
}

export interface ISourcePickerDialogInitial {
  sources: ISerializableSource[];
  shareAudio: boolean;
  audioSupported: boolean;
  nativeAudio: boolean;
  locale: TLanguage;
  audioStreams?: IAudioStreamInfo[];
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
  pick(
    sourceId: string | null,
    withAudio: boolean,
    audioStreamId?: string,
  ): void;
}

export type TUpdaterStatus =
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'ready-deferred'
  | 'error'
  | 'disabled';

export interface IUpdaterProgress {
  percent: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

export interface IUpdaterState {
  status: TUpdaterStatus;
  version?: string;
  progress?: IUpdaterProgress;
  error?: string;
}

export interface IUpdaterDialogInitial {
  state: IUpdaterState;
  locale: TLanguage;
}

export interface IUpdaterDialogAdapter {
  getInitial(): Promise<IUpdaterDialogInitial>;
  getState(): Promise<IUpdaterState>;
  onState(cb: (state: IUpdaterState) => void): () => void;
  download(): void;
  later(): void;
  restart(): void;
  retry(): void;
}

export interface IKonvoezLocalBridge {
  server: IServerDialogAdapter;
  settings: ISettingsDialogAdapter;
  picker: ISourcePickerDialogAdapter;
  updater: IUpdaterDialogAdapter;
}
