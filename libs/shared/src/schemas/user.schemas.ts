import { z } from 'zod';
import { baseEntitySchema, stringSchema } from './base.schemas';
import { emailSchema, fullnameSchema, usernameSchema } from './fields.schemas';
import { EUserRole } from '../enums';

export const userRoleSchema = z.enum(EUserRole);

export const userSchema = baseEntitySchema.extend({
  id: z.number().int(),
  username: usernameSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  role: userRoleSchema,
  avatar: stringSchema.nullish(),
  avatarUrl: stringSchema.nullish(),
  deletedAt: z.coerce.date().nullish(),
});

export type IUser = z.infer<typeof userSchema>;
