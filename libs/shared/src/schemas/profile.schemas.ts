import * as z from 'zod';
import { stringSchema } from './base.schemas';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  usernameSchema,
} from './fields.schemas';

/** Self-profile update: no role (role changes go through user-management). */
export const profileUpdateSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    fullname: fullnameSchema,
    email: emailSchema,
    avatar: stringSchema,
  })
  .partial();

export type IProfileUpdate = z.infer<typeof profileUpdateSchema>;
