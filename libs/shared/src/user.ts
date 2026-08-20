import { z } from 'zod';
import { EUserRole } from './enums';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  usernameSchema,
} from './schemas/fields';

export const userCreateSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  fullname: fullnameSchema,
  email: emailSchema,
});

export const userUpdateSchema = userCreateSchema.partial().extend({
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

export type IUserCreate = z.infer<typeof userCreateSchema>;
export type IUserUpdate = z.infer<typeof userUpdateSchema>;
export type IUser = z.infer<typeof userSchema>;
