import * as z from 'zod';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  userAvatarKeySchema,
  usernameSchema,
} from './fields.schemas';

/** Self-profile update: no role (role changes go through user-management). */
export const profileUpdateSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    fullname: fullnameSchema,
    email: emailSchema,
    avatar: userAvatarKeySchema.nullish(),
  })
  .partial();

export type IProfileUpdate = z.infer<typeof profileUpdateSchema>;
