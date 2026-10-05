import {
  LOCAL_SETTINGS_VERSION,
  localSettingsLooseSchema,
  mediaDeviceInfoSchema,
  streamFpsSchema,
  streamHeightSchema,
  TLocalSettingsPartial,
  TMediaDeviceInfo,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import {
  storageGetItemJson,
  storageSetItemJson,
} from '../../../extentions/local-storage-json';
import { EStorageKey } from '../../app.enums';

const parseDevice = (value: unknown): TMediaDeviceInfo | null => {
  const result = mediaDeviceInfoSchema.safeParse(value);
  return result.success ? result.data : null;
};

const parseHeight = (value: unknown): TStreamHeight | undefined => {
  const result = streamHeightSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseFps = (value: unknown): TStreamFps | undefined => {
  const result = streamFpsSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

/**
 * Read known fields from LOCAL_SETTINGS (loose). Invalid fields are ignored.
 */
export const readLocalSettings = (): TLocalSettingsPartial => {
  const raw = storageGetItemJson(EStorageKey.LOCAL_SETTINGS);
  if (raw == null) {
    return {};
  }

  const parsed = localSettingsLooseSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }

  return {
    version: parsed.data.version,
    audioInput: parseDevice(parsed.data.audioInput) ?? undefined,
    audioOutput: parseDevice(parsed.data.audioOutput) ?? undefined,
    videoInput: parseDevice(parsed.data.videoInput) ?? undefined,
    streamHeight: parseHeight(parsed.data.streamHeight),
    streamFps: parseFps(parsed.data.streamFps),
    screenHeight: parseHeight(parsed.data.screenHeight),
    screenFps: parseFps(parsed.data.screenFps),
    screenPreviewAutoPauseWhenHidden:
      typeof parsed.data.screenPreviewAutoPauseWhenHidden === 'boolean'
        ? parsed.data.screenPreviewAutoPauseWhenHidden
        : undefined,
  };
};

/**
 * True when local settings key is missing or stored schema version differs
 * from the app's current version.
 */
export const needsInitialSetup = (): boolean => {
  const raw = localStorage.getItem(EStorageKey.LOCAL_SETTINGS);
  if (raw == null) {
    return true;
  }

  try {
    const parsed = localSettingsLooseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      return true;
    }
    return parsed.data.version !== LOCAL_SETTINGS_VERSION;
  } catch {
    return true;
  }
};

export type TLocalSettingsWrite = {
  audioInput?: MediaDeviceInfo | TMediaDeviceInfo | null;
  audioOutput?: MediaDeviceInfo | TMediaDeviceInfo | null;
  videoInput?: MediaDeviceInfo | TMediaDeviceInfo | null;
  streamHeight?: TStreamHeight | null;
  streamFps?: TStreamFps | null;
  screenHeight?: TStreamHeight | null;
  screenFps?: TStreamFps | null;
  screenPreviewAutoPauseWhenHidden?: boolean;
};

export const writeLocalSettings = (
  settings: TLocalSettingsWrite,
  options: { stampVersion?: boolean } = {},
): void => {
  const existing = readLocalSettings();
  const version = options.stampVersion
    ? LOCAL_SETTINGS_VERSION
    : existing.version;

  const nextAudioInput =
    settings.audioInput === undefined
      ? existing.audioInput
      : settings.audioInput
        ? (parseDevice(settings.audioInput) ?? undefined)
        : undefined;
  const nextAudioOutput =
    settings.audioOutput === undefined
      ? existing.audioOutput
      : settings.audioOutput
        ? (parseDevice(settings.audioOutput) ?? undefined)
        : undefined;
  const nextVideoInput =
    settings.videoInput === undefined
      ? existing.videoInput
      : settings.videoInput
        ? (parseDevice(settings.videoInput) ?? undefined)
        : undefined;
  const nextHeight =
    settings.streamHeight === undefined
      ? existing.streamHeight
      : (settings.streamHeight ?? undefined);
  const nextFps =
    settings.streamFps === undefined
      ? existing.streamFps
      : (settings.streamFps ?? undefined);
  const nextScreenHeight =
    settings.screenHeight === undefined
      ? existing.screenHeight
      : (settings.screenHeight ?? undefined);
  const nextScreenFps =
    settings.screenFps === undefined
      ? existing.screenFps
      : (settings.screenFps ?? undefined);
  const nextScreenPreviewAutoPause =
    settings.screenPreviewAutoPauseWhenHidden === undefined
      ? existing.screenPreviewAutoPauseWhenHidden
      : settings.screenPreviewAutoPauseWhenHidden;

  const payload = {
    ...(typeof version === 'number' ? { version } : {}),
    ...(nextAudioInput ? { audioInput: nextAudioInput } : {}),
    ...(nextAudioOutput ? { audioOutput: nextAudioOutput } : {}),
    ...(nextVideoInput ? { videoInput: nextVideoInput } : {}),
    ...(nextHeight !== undefined ? { streamHeight: nextHeight } : {}),
    ...(nextFps !== undefined ? { streamFps: nextFps } : {}),
    ...(nextScreenHeight !== undefined
      ? { screenHeight: nextScreenHeight }
      : {}),
    ...(nextScreenFps !== undefined ? { screenFps: nextScreenFps } : {}),
    ...(nextScreenPreviewAutoPause !== undefined
      ? { screenPreviewAutoPauseWhenHidden: nextScreenPreviewAutoPause }
      : {}),
  };

  storageSetItemJson(EStorageKey.LOCAL_SETTINGS, payload);
};
