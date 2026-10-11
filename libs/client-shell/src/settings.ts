import * as z from 'zod';
import { desktopHotkeysSchema } from '@konvoez/shared';

export const windowBoundsSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export const desktopConfigSchema = z.object({
  serverOrigin: z.string().url().nullable(),
  hotkeys: desktopHotkeysSchema,
  autostart: z.boolean(),
  windowBounds: windowBoundsSchema.optional(),
  shareAudio: z.boolean().default(true),
});

export type TDesktopConfig = z.infer<typeof desktopConfigSchema>;

export const DEFAULT_DESKTOP_CONFIG: TDesktopConfig = {
  serverOrigin: null,
  hotkeys: {
    toggleMic: null,
    toggleSpeaker: null,
  },
  autostart: false,
  shareAudio: true,
};
