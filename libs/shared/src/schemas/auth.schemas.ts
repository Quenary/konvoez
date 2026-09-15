import { z } from 'zod';
import { passwordSchema, usernameSchema } from './fields.schemas';

export const authLoginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type IAuthLogin = z.infer<typeof authLoginSchema>;
