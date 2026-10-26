import * as z from 'zod';
import {
  emailSchema,
  fullnameSchema,
  passwordSchema,
  usernameSchema,
} from './fields.schemas';
import { userFullSchema } from './user.schemas';
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

export const twoFactorCodeRegex =
  /^(\d{6}|[0-9a-hj-km-np-tv-z]{5}-?[0-9a-hj-km-np-tv-z]{5})$/i;

export const twoFactorCodeSchema = stringSchema
  .trim()
  .regex(twoFactorCodeRegex);

export const authLoginTwoFactorSchema = z.object({
  code: twoFactorCodeSchema,
});
export type IAuthLoginTwoFactor = z.infer<typeof authLoginTwoFactorSchema>;

export const twoFactorRequiredSchema = z.object({
  twoFactorRequired: z.literal(true),
});
export type ITwoFactorRequired = z.infer<typeof twoFactorRequiredSchema>;

export const authLoginResponseSchema = z.union([
  userFullSchema,
  twoFactorRequiredSchema,
]);
export type IAuthLoginResponse = z.infer<typeof authLoginResponseSchema>;

export const twoFactorSetupSchema = z.object({
  password: passwordSchema,
});
export type ITwoFactorSetup = z.infer<typeof twoFactorSetupSchema>;

export const twoFactorSetupResponseSchema = z.object({
  secret: stringSchema,
  otpauthUri: stringSchema,
});
export type ITwoFactorSetupResponse = z.infer<
  typeof twoFactorSetupResponseSchema
>;

export const twoFactorEnableSchema = z.object({
  code: stringSchema.trim().regex(/^\d{6}$/),
});
export type ITwoFactorEnable = z.infer<typeof twoFactorEnableSchema>;

export const twoFactorConfirmSchema = z.object({
  password: passwordSchema,
  code: twoFactorCodeSchema,
});
export type ITwoFactorConfirm = z.infer<typeof twoFactorConfirmSchema>;

export const twoFactorRecoveryCodesResponseSchema = z.object({
  recoveryCodes: z.array(stringSchema),
});
export type ITwoFactorRecoveryCodesResponse = z.infer<
  typeof twoFactorRecoveryCodesResponseSchema
>;
