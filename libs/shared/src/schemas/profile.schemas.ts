import * as z from 'zod';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  userAvatarKeySchema,
  usernameSchema,
} from './fields.schemas';
import { languageSchema } from './user.schemas';

/** Self-profile update: no role (role changes go through user-management). */
export const profileUpdateSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    fullname: fullnameSchema,
    email: emailSchema,
    avatar: userAvatarKeySchema.nullish(),
    language: languageSchema.nullish(),
  })
  .partial();

export type IProfileUpdate = z.infer<typeof profileUpdateSchema>;
