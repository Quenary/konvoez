import { z } from 'zod';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  usernameSchema,
} from './fields.schemas';

export enum EUserRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export const userCreateSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  setupToken: z.string().trim().optional(),
});

export const userUpdateSchema = userCreateSchema
  .omit({ setupToken: true })
  .partial()
  .extend({
    role: z.enum(EUserRole).optional(),
    avatar: z.string().optional(),
  });

export const userSchema = z.object({
  id: z.number().int(),
  username: usernameSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  role: z.enum(EUserRole),
  avatar: z.string().nullish(),
  avatarUrl: z.string().nullish(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullish(),
});

export const authSetupStatusSchema = z.object({
  isOwnerSetupRequired: z.boolean(),
});

export type IUserCreate = z.infer<typeof userCreateSchema>;
export type IUserUpdate = z.infer<typeof userUpdateSchema>;
export type IUser = z.infer<typeof userSchema>;
export type IAuthSetupStatus = z.infer<typeof authSetupStatusSchema>;
