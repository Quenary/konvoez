import * as z from 'zod';
import { EUserRole } from '../enums';

export const userManagementUpdateSchema = z
  .object({
    roleIds: z.array(z.number().int()).optional(),
    role: z.enum([EUserRole.ADMIN, EUserRole.MEMBER]).optional(),
  })
  .refine((data) => data.role !== undefined || data.roleIds !== undefined, {
    error: 'At least one field is required',
  });

export type IUserManagementUpdate = z.infer<typeof userManagementUpdateSchema>;
