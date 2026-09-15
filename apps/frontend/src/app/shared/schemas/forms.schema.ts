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

export function getRegisterFormSchema(isOwnerSetupRequired: boolean) {
  const base = userCreateSchema.extend({
    confirmPassword: passwordSchema,
    setupToken: isOwnerSetupRequired
      ? z
          .string({ error: 'VALIDATION.SETUP_TOKEN_REQUIRED' })
          .trim()
          .min(1, { error: 'VALIDATION.SETUP_TOKEN_REQUIRED' })
      : z.string().trim().optional(),
  });

  return base.refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    error: 'VALIDATION.PASSWORD_MISMATCH',
  });
}

export const registerFormSchema = getRegisterFormSchema(false);

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
