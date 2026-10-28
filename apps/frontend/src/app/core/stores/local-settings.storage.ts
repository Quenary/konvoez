import {
  echoCancellationSchema,
  inputGainSchema,
  LOCAL_SETTINGS_VERSION,
  localSettingsLooseSchema,
  mediaDeviceInfoSchema,
  noiseProcessorSchema,
  outputVolumeSchema,
  streamBitrateKbpsSchema,
  streamContentModeSchema,
  streamFpsSchema,
  streamHeightSchema,
  streamLayersSchema,
  TLocalSettingsPartial,
  TMediaDeviceInfo,
  TStreamContentMode,
  TStreamFps,
  TStreamHeight,
} from '@shared/schemas/local-settings.schema';
import {
  storageGetItemJson,
  storageSetItemJson,
} from '../../../extentions/local-storage-json';
import { ENoiseProcessor, EStorageKey } from '../../app.enums';

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

const parseLayers = (value: unknown): number | undefined => {
  const result = streamLayersSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseBitrateKbps = (value: unknown): number | undefined => {
  const result = streamBitrateKbpsSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseContentMode = (value: unknown): TStreamContentMode | undefined => {
  const result = streamContentModeSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseNoiseProcessor = (value: unknown): ENoiseProcessor | undefined => {
  const result = noiseProcessorSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseInputGain = (value: unknown): number | undefined => {
  const result = inputGainSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseOutputVolume = (value: unknown): number | undefined => {
  const result = outputVolumeSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseEchoCancellation = (value: unknown): boolean | undefined => {
  const result = echoCancellationSchema.safeParse(value);
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

  if (typeof raw !== 'object') {
    return {};
  }
  const record = raw as Record<string, unknown>;
  const streamFields = {
    streamLayers: parseLayers(record['streamLayers']),
    streamBitrateKbps: parseBitrateKbps(record['streamBitrateKbps']),
    screenLayers: parseLayers(record['screenLayers']),
    screenBitrateKbps: parseBitrateKbps(record['screenBitrateKbps']),
    screenContentMode: parseContentMode(record['screenContentMode']),
  };
  const withoutStreamFields = { ...record };
  delete withoutStreamFields['streamLayers'];
  delete withoutStreamFields['streamBitrateKbps'];
  delete withoutStreamFields['screenLayers'];
  delete withoutStreamFields['screenBitrateKbps'];
  delete withoutStreamFields['screenContentMode'];
  const parsed = localSettingsLooseSchema.safeParse(withoutStreamFields);
  if (!parsed.success) {
    return streamFields;
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
    ...streamFields,
    screenPreviewAutoPauseWhenHidden:
      typeof parsed.data.screenPreviewAutoPauseWhenHidden === 'boolean'
        ? parsed.data.screenPreviewAutoPauseWhenHidden
        : undefined,
    noiseProcessor: parseNoiseProcessor(parsed.data.noiseProcessor),
    inputGain: parseInputGain(parsed.data.inputGain),
    outputVolume: parseOutputVolume(parsed.data.outputVolume),
    echoCancellation: parseEchoCancellation(parsed.data.echoCancellation),
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
  streamLayers?: number | null;
  streamBitrateKbps?: number | null;
  screenLayers?: number | null;
  screenBitrateKbps?: number | null;
  screenContentMode?: TStreamContentMode | null;
  screenPreviewAutoPauseWhenHidden?: boolean;
  noiseProcessor?: ENoiseProcessor | null;
  inputGain?: number | null;
  outputVolume?: number | null;
  echoCancellation?: boolean | null;
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
  const nextStreamLayers =
    settings.streamLayers === undefined
      ? existing.streamLayers
      : (settings.streamLayers ?? undefined);
  const nextStreamBitrate =
    settings.streamBitrateKbps === undefined
      ? existing.streamBitrateKbps
      : (settings.streamBitrateKbps ?? undefined);
  const nextScreenLayers =
    settings.screenLayers === undefined
      ? existing.screenLayers
      : (settings.screenLayers ?? undefined);
  const nextScreenBitrate =
    settings.screenBitrateKbps === undefined
      ? existing.screenBitrateKbps
      : (settings.screenBitrateKbps ?? undefined);
  const nextScreenContentMode =
    settings.screenContentMode === undefined
      ? existing.screenContentMode
      : (settings.screenContentMode ?? undefined);
  const nextScreenPreviewAutoPause =
    settings.screenPreviewAutoPauseWhenHidden === undefined
      ? existing.screenPreviewAutoPauseWhenHidden
      : settings.screenPreviewAutoPauseWhenHidden;
  const nextNoiseProcessor =
    settings.noiseProcessor === undefined
      ? existing.noiseProcessor
      : (settings.noiseProcessor ?? undefined);
  const nextInputGain =
    settings.inputGain === undefined
      ? existing.inputGain
      : (settings.inputGain ?? undefined);
  const nextOutputVolume =
    settings.outputVolume === undefined
      ? existing.outputVolume
      : (settings.outputVolume ?? undefined);
  const nextEchoCancellation =
    settings.echoCancellation === undefined
      ? existing.echoCancellation
      : (settings.echoCancellation ?? undefined);

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
    ...(nextStreamLayers !== undefined
      ? { streamLayers: nextStreamLayers }
      : {}),
    ...(nextStreamBitrate !== undefined
      ? { streamBitrateKbps: nextStreamBitrate }
      : {}),
    ...(nextScreenLayers !== undefined
      ? { screenLayers: nextScreenLayers }
      : {}),
    ...(nextScreenBitrate !== undefined
      ? { screenBitrateKbps: nextScreenBitrate }
      : {}),
    ...(nextScreenContentMode !== undefined
      ? { screenContentMode: nextScreenContentMode }
      : {}),
    ...(nextScreenPreviewAutoPause !== undefined
      ? { screenPreviewAutoPauseWhenHidden: nextScreenPreviewAutoPause }
      : {}),
    ...(nextNoiseProcessor !== undefined
      ? { noiseProcessor: nextNoiseProcessor }
      : {}),
    ...(nextInputGain !== undefined ? { inputGain: nextInputGain } : {}),
    ...(nextOutputVolume !== undefined
      ? { outputVolume: nextOutputVolume }
      : {}),
    ...(nextEchoCancellation !== undefined
      ? { echoCancellation: nextEchoCancellation }
      : {}),
  };

  storageSetItemJson(EStorageKey.LOCAL_SETTINGS, payload);
};
