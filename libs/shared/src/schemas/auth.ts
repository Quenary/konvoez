import { z } from 'zod';
import { passwordSchema, usernameSchema } from './fields';

export const authLoginSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export type IAuthLogin = z.infer<typeof authLoginSchema>;
