import * as z from 'zod';

export const userManagementUpdateSchema = z.object({
  roleIds: z.array(z.number().int()),
});

export type IUserManagementUpdate = z.infer<typeof userManagementUpdateSchema>;
