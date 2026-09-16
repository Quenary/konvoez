import { z } from 'zod';

export const publicSettingsSchema = z.object({
  isOwnerSetupRequired: z.boolean(),
  inviteOnlySignUp: z.boolean(),
});

export type IPublicSettings = z.infer<typeof publicSettingsSchema>;
