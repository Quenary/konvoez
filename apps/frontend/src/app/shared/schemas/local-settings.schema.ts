import * as z from 'zod';

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
  screenPreviewAutoPauseWhenHidden: z.boolean().optional(),
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
  screenPreviewAutoPauseWhenHidden: z.boolean().optional(),
});

export type TLocalSettingsPartial = z.infer<typeof localSettingsLooseSchema>;

export const DEFAULT_SCREEN_PREVIEW_AUTO_PAUSE_WHEN_HIDDEN = true;
