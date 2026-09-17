import { z } from 'zod';
import { baseEntitySchema, stringSchema } from './base.schemas';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  usernameSchema,
} from './fields.schemas';
import { EUserRole } from '../enums';

export const userRoleSchema = z.enum(EUserRole);

export const userCreateSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  setupToken: stringSchema.trim().optional(),
  inviteCode: stringSchema.trim().optional(),
});

export const userUpdateSchema = userCreateSchema
  .omit({ setupToken: true, inviteCode: true })
  .partial()
  .extend({
    role: userRoleSchema.optional(),
    avatar: stringSchema.optional(),
  });

export const userSchema = baseEntitySchema.extend({
  id: z.number().int(),
  username: usernameSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  role: userRoleSchema,
  avatar: stringSchema.nullish(),
  avatarUrl: stringSchema.nullish(),
});

export type IUserCreate = z.infer<typeof userCreateSchema>;
export type IUserUpdate = z.infer<typeof userUpdateSchema>;
export type IUser = z.infer<typeof userSchema>;
