import { z } from 'zod';

export const LOCAL_SETTINGS_VERSION = 1 as const;

export const mediaDeviceInfoSchema = z.object({
  deviceId: z.string().min(1),
  kind: z.string().min(1),
  label: z.string(),
  groupId: z.string(),
});

export type TMediaDeviceInfo = z.infer<typeof mediaDeviceInfoSchema>;

/**
 * Current local settings document. Devices are optional — browsers may lack
 * MediaDevices API; voice flow falls back to defaults when unset.
 */
export const localSettingsSchema = z.object({
  version: z.literal(LOCAL_SETTINGS_VERSION),
  audioInput: mediaDeviceInfoSchema.optional(),
  audioOutput: mediaDeviceInfoSchema.optional(),
});

export type TLocalSettings = z.infer<typeof localSettingsSchema>;

export const localSettingsLooseSchema = z.looseObject({
  version: z.number().optional(),
  audioInput: mediaDeviceInfoSchema.optional(),
  audioOutput: mediaDeviceInfoSchema.optional(),
});

export type TLocalSettingsPartial = z.infer<typeof localSettingsLooseSchema>;
