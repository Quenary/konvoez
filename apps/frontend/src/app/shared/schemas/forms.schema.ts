import { z } from 'zod';
import {
  ERoomType,
  emailSchema,
  fullnameSchema,
  passwordSchema,
  roomNameSchema,
  userCreateSchema,
  usernameSchema,
} from '@konvoez/shared';

export const registerFormSchema = userCreateSchema
  .extend({
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    error: 'VALIDATION.PASSWORD_MISMATCH',
  });

export type RegisterFormValue = z.infer<typeof registerFormSchema>;

const profileFormBaseSchema = z.object({
  username: usernameSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  avatar: z.string().nullable(),
  isChangingPassword: z.boolean(),
  password: z.string(),
  confirmPassword: z.string(),
  avatarFile: z.unknown().nullable(),
});

export function getProfileFormSchema(isChangingPassword: boolean) {
  if (!isChangingPassword) {
    return profileFormBaseSchema;
  }

  return profileFormBaseSchema
    .extend({
      password: passwordSchema,
      confirmPassword: passwordSchema,
    })
    .refine((data) => data.password === data.confirmPassword, {
      path: ['confirmPassword'],
      error: 'VALIDATION.PASSWORD_MISMATCH',
    });
}

export const roomFormSchema = z.object({
  name: roomNameSchema,
  type: z.enum(ERoomType, { error: 'VALIDATION.ROOM_TYPE' }),
  avatar: z.string().nullable(),
  avatarFile: z.unknown().nullable(),
});
