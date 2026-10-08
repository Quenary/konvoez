import * as z from 'zod';
import { EUserRole } from '../enums';

export const userManagementUpdateSchema = z
  .object({
    role: z.enum([EUserRole.ADMIN, EUserRole.MEMBER]),
  })
  .partial()
  .refine((data) => data.role !== undefined, {
    error: 'At least one field is required',
  });

export type IUserManagementUpdate = z.infer<typeof userManagementUpdateSchema>;
