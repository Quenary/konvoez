import * as z from 'zod';

export const publicSettingsSchema = z.object({
  isOwnerSetupRequired: z.boolean(),
  inviteOnlySignUp: z.boolean(),
});

export type IPublicSettings = z.infer<typeof publicSettingsSchema>;

export const publicVersionSchema = z.object({
  currentVersion: z.string(),
  availableVersion: z.string(),
  releaseUrl: z.string().url().nullable(),
  updateAvailable: z.boolean(),
});

export type IPublicVersion = z.infer<typeof publicVersionSchema>;
