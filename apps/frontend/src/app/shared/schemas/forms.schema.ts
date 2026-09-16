import { z } from 'zod';
import {
  emailSchema,
  fullnameSchema,
  inviteDefaultTtl,
  inviteMaxTtl,
  inviteMinTtl,
  passwordSchema,
  roomNameSchema,
  roomTypeSchema,
  SCHEMA_ERROR,
  stringSchema,
  userCreateSchema,
  usernameSchema,
} from '@konvoez/shared';

const refinePasswordMatch = <
  T extends z.ZodType<{ password?: string; confirmPassword?: string }>,
>(
  schema: T,
) =>
  schema.refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    error: SCHEMA_ERROR.PASSWORD_MISMATCH,
  });

const requiredTrimmedString = (error: string) =>
  z.string({ error }).trim().min(1, { error });

export function getRegisterFormSchema(options: {
  isOwnerSetupRequired: boolean;
  inviteOnlySignUp: boolean;
}) {
  const base = userCreateSchema.extend({
    confirmPassword: passwordSchema,
    setupToken: options.isOwnerSetupRequired
      ? requiredTrimmedString(SCHEMA_ERROR.SETUP_TOKEN_REQUIRED)
      : stringSchema.trim().optional(),
    inviteCode:
      options.inviteOnlySignUp && !options.isOwnerSetupRequired
        ? requiredTrimmedString(SCHEMA_ERROR.INVITE_CODE_REQUIRED)
        : stringSchema.trim().optional(),
  });

  return refinePasswordMatch(base);
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
  avatar: stringSchema.nullable(),
  isChangingPassword: z.boolean(),
  password: stringSchema,
  confirmPassword: stringSchema,
  avatarFile: z.unknown().nullable(),
});

export function getProfileFormSchema(isChangingPassword: boolean) {
  if (!isChangingPassword) {
    return profileFormBaseSchema;
  }

  return refinePasswordMatch(
    profileFormBaseSchema.extend({
      password: passwordSchema,
      confirmPassword: passwordSchema,
    }),
  );
}

export const roomFormSchema = z.object({
  name: roomNameSchema,
  type: roomTypeSchema,
  avatar: stringSchema.nullable(),
  avatarFile: z.unknown().nullable(),
});

export const inviteMinTtlMinutes = inviteMinTtl / 60_000;
export const inviteMaxTtlMinutes = inviteMaxTtl / 60_000;
export const inviteDefaultTtlMinutes = inviteDefaultTtl / 60_000;

export const inviteFormEmailSchema = stringSchema
  .trim()
  .refine((val) => val === '' || emailSchema.safeParse(val).success, {
    error: SCHEMA_ERROR.EMAIL,
  });

export const inviteFormTtlSchema = z.coerce
  .number({ error: SCHEMA_ERROR.REQUIRED })
  .int({ error: SCHEMA_ERROR.TTL_RANGE })
  .min(inviteMinTtlMinutes, { error: SCHEMA_ERROR.TTL_RANGE })
  .max(inviteMaxTtlMinutes, { error: SCHEMA_ERROR.TTL_RANGE });

export const inviteCreateFormSchema = z.object({
  email: inviteFormEmailSchema,
  ttlMinutes: inviteFormTtlSchema,
});

export type InviteCreateFormValue = z.infer<typeof inviteCreateFormSchema>;
