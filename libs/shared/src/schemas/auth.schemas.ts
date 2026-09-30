import { z } from 'zod';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  usernameSchema,
} from './fields.schemas';
import { passwordRecoveryCodeLength } from '../const';
import { SCHEMA_ERROR, stringSchema } from './base.schemas';

export const authLoginSchema = z.object({
  login: z.union([usernameSchema, emailSchema]),
  password: passwordSchema,
});

export type IAuthLogin = z.infer<typeof authLoginSchema>;

export const authRegisterSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  setupToken: stringSchema.trim().optional(),
  inviteCode: stringSchema.trim().optional(),
});

export type IAuthRegister = z.infer<typeof authRegisterSchema>;

export const passwordRecoveryCodeSchema = stringSchema.regex(
  new RegExp(`^\\d{${passwordRecoveryCodeLength}}$`),
  { error: SCHEMA_ERROR.RECOVERY_CODE },
);

export const passwordRecoveryRequestSchema = z.object({
  email: emailSchema,
});
export type IPasswordRecoveryRequest = z.infer<
  typeof passwordRecoveryRequestSchema
>;

export const passwordRecoveryConfirmSchema = z.object({
  email: emailSchema,
  code: passwordRecoveryCodeSchema,
  password: passwordSchema,
});
export type IPasswordRecoveryConfirm = z.infer<
  typeof passwordRecoveryConfirmSchema
>;
