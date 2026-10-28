import {
  DEFAULT_STREAM_LAYERS,
  STREAM_BITRATE_SLIDER_MIN_KBPS,
  STREAM_LAYER_COUNT_MAX,
  STREAM_LAYER_COUNT_MIN,
  TStreamContentMode,
} from '@konvoez/shared';
import * as z from 'zod';
import { ENoiseProcessor } from '../../app.enums';

export { DEFAULT_STREAM_LAYERS };
export type { TStreamContentMode };

export const LOCAL_SETTINGS_VERSION = 1 as const;

export const STREAM_HEIGHTS = [360, 480, 720, 1080] as const;
export type TStreamHeight = (typeof STREAM_HEIGHTS)[number];
export const DEFAULT_STREAM_HEIGHT: TStreamHeight = 720;

export const STREAM_FPS_OPTIONS = [15, 30, 60] as const;
export type TStreamFps = (typeof STREAM_FPS_OPTIONS)[number];
export const DEFAULT_STREAM_FPS: TStreamFps = 30;

export const mediaDeviceInfoSchema = z.object({
  deviceId: z.string().min(1),
  kind: z.string().min(1),
  label: z.string(),
  groupId: z.string(),
});

export type TMediaDeviceInfo = z.infer<typeof mediaDeviceInfoSchema>;

export const streamHeightSchema = z.union([
  z.literal(360),
  z.literal(480),
  z.literal(720),
  z.literal(1080),
]);

export const streamFpsSchema = z.union([
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

export const streamLayersSchema = z
  .number()
  .int()
  .min(STREAM_LAYER_COUNT_MIN)
  .max(STREAM_LAYER_COUNT_MAX);
export const streamBitrateKbpsSchema = z
  .number()
  .int()
  .min(STREAM_BITRATE_SLIDER_MIN_KBPS);
export const streamContentModeSchema = z.enum(['detail', 'motion']);
export const DEFAULT_SCREEN_CONTENT_MODE: TStreamContentMode = 'detail';

export const noiseProcessorSchema = z.enum(ENoiseProcessor);
export type TNoiseProcessor = z.infer<typeof noiseProcessorSchema>;
export const DEFAULT_NOISE_PROCESSOR: ENoiseProcessor =
  ENoiseProcessor.DEEPFILTER;

export const inputGainSchema = z.number().min(0).max(2);
export const DEFAULT_INPUT_GAIN = 1;

export const outputVolumeSchema = z.number().min(0).max(2);
export const DEFAULT_OUTPUT_VOLUME = 1;

export const echoCancellationSchema = z.boolean();
export const DEFAULT_ECHO_CANCELLATION = false;

/**
 * Current local settings document. Devices are optional — browsers may lack
 * MediaDevices API; voice flow falls back to defaults when unset.
 */
export const localSettingsSchema = z.object({
  version: z.literal(LOCAL_SETTINGS_VERSION),
  audioInput: mediaDeviceInfoSchema.optional(),
  audioOutput: mediaDeviceInfoSchema.optional(),
  videoInput: mediaDeviceInfoSchema.optional(),
  streamHeight: streamHeightSchema.optional(),
  streamFps: streamFpsSchema.optional(),
  screenHeight: streamHeightSchema.optional(),
  screenFps: streamFpsSchema.optional(),
  streamLayers: streamLayersSchema.optional(),
  streamBitrateKbps: streamBitrateKbpsSchema.optional(),
  screenLayers: streamLayersSchema.optional(),
  screenBitrateKbps: streamBitrateKbpsSchema.optional(),
  screenContentMode: streamContentModeSchema.optional(),
  screenPreviewAutoPauseWhenHidden: z.boolean().optional(),
  noiseProcessor: noiseProcessorSchema.optional(),
  inputGain: inputGainSchema.optional(),
  outputVolume: outputVolumeSchema.optional(),
  echoCancellation: echoCancellationSchema.optional(),
});

export type TLocalSettings = z.infer<typeof localSettingsSchema>;

export const localSettingsLooseSchema = z.looseObject({
  version: z.number().optional(),
  audioInput: mediaDeviceInfoSchema.optional(),
  audioOutput: mediaDeviceInfoSchema.optional(),
  videoInput: mediaDeviceInfoSchema.optional(),
  streamHeight: streamHeightSchema.optional(),
  streamFps: streamFpsSchema.optional(),
  screenHeight: streamHeightSchema.optional(),
  screenFps: streamFpsSchema.optional(),
  streamLayers: streamLayersSchema.optional(),
  streamBitrateKbps: streamBitrateKbpsSchema.optional(),
  screenLayers: streamLayersSchema.optional(),
  screenBitrateKbps: streamBitrateKbpsSchema.optional(),
  screenContentMode: streamContentModeSchema.optional(),
  screenPreviewAutoPauseWhenHidden: z.boolean().optional(),
  noiseProcessor: noiseProcessorSchema.optional(),
  inputGain: inputGainSchema.optional(),
  outputVolume: outputVolumeSchema.optional(),
  echoCancellation: echoCancellationSchema.optional(),
});

export type TLocalSettingsPartial = z.infer<typeof localSettingsLooseSchema>;

export const DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN = true;
