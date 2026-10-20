import * as z from 'zod';
import {
  baseEntitySchema,
  entityDeletedSchema,
  stringSchema,
} from './base.schemas';
import { emailSchema, fullnameSchema, usernameSchema } from './fields.schemas';
import { EPermission, EUserRole } from '../enums';
import { roleSummarySchema } from './role.schemas';

export const userRoleSchema = z.enum(EUserRole);

export const userSchema = baseEntitySchema.extend({
  id: z.number().int(),
  username: usernameSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  isOwner: z.boolean().default(false),
  roles: z.array(roleSummarySchema).default([]),
  permissions: z.array(z.nativeEnum(EPermission)).default([]),
  role: userRoleSchema.optional(),
  avatar: stringSchema.nullish(),
  avatarUrl: stringSchema.nullish(),
  deletedAt: z.coerce.date().nullish(),
});

export type IUser = z.infer<typeof userSchema>;

export const userBriefSchema = userSchema.pick({
  id: true,
  username: true,
  fullname: true,
});

export type IUserBrief = z.infer<typeof userBriefSchema>;

export const userDeletedSchema = entityDeletedSchema.clone();
export type IUserDeleted = z.infer<typeof userDeletedSchema>;
