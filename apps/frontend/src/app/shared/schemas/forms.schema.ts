import { z } from 'zod';
import {
  ERoomType,
  emailSchema,
  fullnameSchema,
  inviteDefaultTtl,
  inviteMaxTtl,
  inviteMinTtl,
  passwordSchema,
  roomNameSchema,
  userCreateSchema,
  usernameSchema,
} from '@konvoez/shared';

export function getRegisterFormSchema(options: {
  isOwnerSetupRequired: boolean;
  inviteOnlySignUp: boolean;
}) {
  const base = userCreateSchema.extend({
    confirmPassword: passwordSchema,
    setupToken: options.isOwnerSetupRequired
      ? z
          .string({ error: 'VALIDATION.SETUP_TOKEN_REQUIRED' })
          .trim()
          .min(1, { error: 'VALIDATION.SETUP_TOKEN_REQUIRED' })
      : z.string().trim().optional(),
    inviteCode:
      options.inviteOnlySignUp && !options.isOwnerSetupRequired
        ? z
            .string({ error: 'VALIDATION.INVITE_CODE_REQUIRED' })
            .trim()
            .min(1, { error: 'VALIDATION.INVITE_CODE_REQUIRED' })
        : z.string().trim().optional(),
  });

  return base.refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    error: 'VALIDATION.PASSWORD_MISMATCH',
  });
}

export const registerFormSchema = getRegisterFormSchema({
  isOwnerSetupRequired: false,
  inviteOnlySignUp: false,
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

export const inviteMinTtlMinutes = inviteMinTtl / 60_000;
export const inviteMaxTtlMinutes = inviteMaxTtl / 60_000;
export const inviteDefaultTtlMinutes = inviteDefaultTtl / 60_000;

export const inviteFormEmailSchema = z
  .string()
  .trim()
  .refine((val) => val === '' || emailSchema.safeParse(val).success, {
    error: 'VALIDATION.EMAIL',
  });

export const inviteFormTtlSchema = z.coerce
  .number({ error: 'VALIDATION.REQUIRED' })
  .int({ error: 'VALIDATION.TTL_RANGE' })
  .min(inviteMinTtlMinutes, { error: 'VALIDATION.TTL_RANGE' })
  .max(inviteMaxTtlMinutes, { error: 'VALIDATION.TTL_RANGE' });

export const inviteCreateFormSchema = z.object({
  email: inviteFormEmailSchema,
  ttlMinutes: inviteFormTtlSchema,
});

export type InviteCreateFormValue = z.infer<typeof inviteCreateFormSchema>;
