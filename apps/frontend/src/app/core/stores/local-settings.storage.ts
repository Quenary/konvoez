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
  streamExtraLayersSchema,
  streamFpsSchema,
  streamSvcModeSchema,
  streamHeightSchema,
  streamVideoCodecSchema,
  TLocalSettingsPartial,
  TMediaDeviceInfo,
  TStreamContentMode,
  TStreamFps,
  TStreamHeight,
  TStreamLayer,
  TStreamSvcMode,
  TStreamVideoCodec,
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

const parseExtraLayers = (value: unknown): TStreamLayer[] | undefined => {
  const result = streamExtraLayersSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseSvcMode = (value: unknown): TStreamSvcMode | undefined => {
  const result = streamSvcModeSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseBitrateKbps = (value: unknown): number | undefined => {
  const result = streamBitrateKbpsSchema.safeParse(value);
  return result.success ? result.data : undefined;
};

const parseStreamCodec = (value: unknown): TStreamVideoCodec | undefined => {
  const parsed = streamVideoCodecSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
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
  const parsed = localSettingsLooseSchema.safeParse(raw);
  if (!parsed.success) {
    return {};
  }

  return {
    version: parsed.data.version,
    audioInput: parseDevice(parsed.data.audioInput) ?? undefined,
    audioOutput: parseDevice(parsed.data.audioOutput) ?? undefined,
    cameraInput: parseDevice(parsed.data.cameraInput) ?? undefined,
    cameraHeight: parseHeight(parsed.data.cameraHeight),
    cameraFps: parseFps(parsed.data.cameraFps),
    cameraExtraLayers: parseExtraLayers(parsed.data.cameraExtraLayers),
    cameraSvcMode: parseSvcMode(parsed.data.cameraSvcMode),
    cameraBitrateKbps: parseBitrateKbps(parsed.data.cameraBitrateKbps),
    cameraCodec: parseStreamCodec(parsed.data.cameraCodec),
    screenHeight: parseHeight(parsed.data.screenHeight),
    screenFps: parseFps(parsed.data.screenFps),
    screenExtraLayers: parseExtraLayers(parsed.data.screenExtraLayers),
    screenSvcMode: parseSvcMode(parsed.data.screenSvcMode),
    screenBitrateKbps: parseBitrateKbps(parsed.data.screenBitrateKbps),
    screenContentMode: parseContentMode(parsed.data.screenContentMode),
    screenCodec: parseStreamCodec(parsed.data.screenCodec),
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
  cameraInput?: MediaDeviceInfo | TMediaDeviceInfo | null;
  cameraHeight?: TStreamHeight | null;
  cameraFps?: TStreamFps | null;
  cameraExtraLayers?: TStreamLayer[] | null;
  cameraSvcMode?: TStreamSvcMode | null;
  cameraBitrateKbps?: number | null;
  cameraCodec?: TStreamVideoCodec | null;
  screenHeight?: TStreamHeight | null;
  screenFps?: TStreamFps | null;
  screenExtraLayers?: TStreamLayer[] | null;
  screenSvcMode?: TStreamSvcMode | null;
  screenBitrateKbps?: number | null;
  screenContentMode?: TStreamContentMode | null;
  screenCodec?: TStreamVideoCodec | null;
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
  const nextCameraInput =
    settings.cameraInput === undefined
      ? existing.cameraInput
      : settings.cameraInput
        ? (parseDevice(settings.cameraInput) ?? undefined)
        : undefined;
  const nextHeight =
    settings.cameraHeight === undefined
      ? existing.cameraHeight
      : (settings.cameraHeight ?? undefined);
  const nextFps =
    settings.cameraFps === undefined
      ? existing.cameraFps
      : (settings.cameraFps ?? undefined);
  const nextScreenHeight =
    settings.screenHeight === undefined
      ? existing.screenHeight
      : (settings.screenHeight ?? undefined);
  const nextScreenFps =
    settings.screenFps === undefined
      ? existing.screenFps
      : (settings.screenFps ?? undefined);
  const nextCameraExtraLayers =
    settings.cameraExtraLayers === undefined
      ? existing.cameraExtraLayers
      : (settings.cameraExtraLayers ?? undefined);
  const nextCameraSvcMode =
    settings.cameraSvcMode === undefined
      ? existing.cameraSvcMode
      : (settings.cameraSvcMode ?? undefined);
  const nextCameraBitrate =
    settings.cameraBitrateKbps === undefined
      ? existing.cameraBitrateKbps
      : (settings.cameraBitrateKbps ?? undefined);
  const nextScreenExtraLayers =
    settings.screenExtraLayers === undefined
      ? existing.screenExtraLayers
      : (settings.screenExtraLayers ?? undefined);
  const nextScreenSvcMode =
    settings.screenSvcMode === undefined
      ? existing.screenSvcMode
      : (settings.screenSvcMode ?? undefined);
  const nextScreenBitrate =
    settings.screenBitrateKbps === undefined
      ? existing.screenBitrateKbps
      : (settings.screenBitrateKbps ?? undefined);
  const nextScreenContentMode =
    settings.screenContentMode === undefined
      ? existing.screenContentMode
      : (settings.screenContentMode ?? undefined);
  const nextCameraCodec =
    settings.cameraCodec === undefined
      ? existing.cameraCodec
      : (settings.cameraCodec ?? undefined);
  const nextScreenCodec =
    settings.screenCodec === undefined
      ? existing.screenCodec
      : (settings.screenCodec ?? undefined);
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
    ...(nextCameraInput ? { cameraInput: nextCameraInput } : {}),
    ...(nextHeight !== undefined ? { cameraHeight: nextHeight } : {}),
    ...(nextFps !== undefined ? { cameraFps: nextFps } : {}),
    ...(nextCameraExtraLayers !== undefined
      ? { cameraExtraLayers: nextCameraExtraLayers }
      : {}),
    ...(nextCameraSvcMode !== undefined
      ? { cameraSvcMode: nextCameraSvcMode }
      : {}),
    ...(nextCameraBitrate !== undefined
      ? { cameraBitrateKbps: nextCameraBitrate }
      : {}),
    ...(nextCameraCodec !== undefined ? { cameraCodec: nextCameraCodec } : {}),
    ...(nextScreenHeight !== undefined
      ? { screenHeight: nextScreenHeight }
      : {}),
    ...(nextScreenFps !== undefined ? { screenFps: nextScreenFps } : {}),
    ...(nextScreenExtraLayers !== undefined
      ? { screenExtraLayers: nextScreenExtraLayers }
      : {}),
    ...(nextScreenSvcMode !== undefined
      ? { screenSvcMode: nextScreenSvcMode }
      : {}),
    ...(nextScreenBitrate !== undefined
      ? { screenBitrateKbps: nextScreenBitrate }
      : {}),
    ...(nextScreenContentMode !== undefined
      ? { screenContentMode: nextScreenContentMode }
      : {}),
    ...(nextScreenCodec !== undefined ? { screenCodec: nextScreenCodec } : {}),
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
