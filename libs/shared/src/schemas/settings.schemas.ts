import { z } from 'zod';
import { baseEntitySchema, SCHEMA_ERROR, stringSchema } from './base.schemas';
import { ESettingKey } from '../enums';
import {
  passwordRecoveryCodeDefaultTtl,
  passwordRecoveryCodeMaxTtl,
  passwordRecoveryCodeMinTtl,
} from '../const';

/* ==========================================================================
   ICE Servers Setting
   ========================================================================== */

export const iceServerSchema = z.object(
  {
    urls: z.union(
      [
        stringSchema,
        z.array(stringSchema, {
          error: SCHEMA_ERROR.INVALID_SCHEMA,
        }),
      ],
      { error: SCHEMA_ERROR.INVALID_SCHEMA },
    ),
    username: stringSchema.optional(),
    credential: stringSchema.optional(),
    credentialType: z
      .enum(['password', 'oauth'], {
        error: SCHEMA_ERROR.INVALID_SCHEMA,
      })
      .optional(),
  },
  { error: SCHEMA_ERROR.INVALID_SCHEMA },
);
export type TIceServer = z.infer<typeof iceServerSchema>;

export const iceServersSettingValueSchema = z.array(iceServerSchema, {
  error: SCHEMA_ERROR.INVALID_SCHEMA,
});
export type TIceServersSettingValue = z.infer<
  typeof iceServersSettingValueSchema
>;

export const DEFAULT_ICE_SERVERS: TIceServersSettingValue = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
  {
    urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.nextcloud.com:443'],
  },
  {
    urls: ['stun:stun.sipnet.ru:3478', 'stun:stun.demos.ru:3478'],
  },
  {
    urls: ['stun:stun.qq.com:3478', 'stun:stun.miwifi.com:3478'],
  },
];

export const iceServersSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.ICE_SERVERS),
  value: iceServersSettingValueSchema,
});

export const iceServersSettingSchema = iceServersSettingBaseSchema.extend(
  baseEntitySchema.shape,
);
export type TIceServersSetting = z.infer<typeof iceServersSettingSchema>;

/* ==========================================================================
   Invite-Only Sign Up Setting
   ========================================================================== */

export const inviteOnlySignUpSettingValueSchema = z.boolean();
export type TInviteOnlySignUpSettingValue = z.infer<
  typeof inviteOnlySignUpSettingValueSchema
>;

export const DEFAULT_INVITE_ONLY_SIGN_UP: TInviteOnlySignUpSettingValue = true;

export const inviteOnlySignUpSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.INVITE_ONLY_SIGN_UP),
  value: inviteOnlySignUpSettingValueSchema,
});

export const inviteOnlySignUpSettingSchema =
  inviteOnlySignUpSettingBaseSchema.extend(baseEntitySchema.shape);
export type TInviteOnlySignUpSetting = z.infer<
  typeof inviteOnlySignUpSettingSchema
>;

/* ==========================================================================
   Password Recovery Code TTL Setting
   ========================================================================== */

export const passwordRecoveryCodeTtlSettingValueSchema = z
  .number({ error: SCHEMA_ERROR.TTL_RANGE })
  .int({ error: SCHEMA_ERROR.TTL_RANGE })
  .min(passwordRecoveryCodeMinTtl, { error: SCHEMA_ERROR.TTL_RANGE })
  .max(passwordRecoveryCodeMaxTtl, { error: SCHEMA_ERROR.TTL_RANGE });
export type TPasswordRecoveryCodeTtlSettingValue = z.infer<
  typeof passwordRecoveryCodeTtlSettingValueSchema
>;

export const DEFAULT_PASSWORD_RECOVERY_CODE_TTL: TPasswordRecoveryCodeTtlSettingValue =
  passwordRecoveryCodeDefaultTtl;

export const passwordRecoveryCodeTtlSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.PASSWORD_RECOVERY_CODE_TTL),
  value: passwordRecoveryCodeTtlSettingValueSchema,
});

export const passwordRecoveryCodeTtlSettingSchema =
  passwordRecoveryCodeTtlSettingBaseSchema.extend(baseEntitySchema.shape);
export type TPasswordRecoveryCodeTtlSetting = z.infer<
  typeof passwordRecoveryCodeTtlSettingSchema
>;

/* ==========================================================================
   Maps, Unions & Bulk Update Schemas
   ========================================================================== */

export const settingValueSchemas = {
  [ESettingKey.ICE_SERVERS]: iceServersSettingValueSchema,
  [ESettingKey.INVITE_ONLY_SIGN_UP]: inviteOnlySignUpSettingValueSchema,
  [ESettingKey.PASSWORD_RECOVERY_CODE_TTL]:
    passwordRecoveryCodeTtlSettingValueSchema,
} as const;

export const defaultSettingValues = {
  [ESettingKey.ICE_SERVERS]: DEFAULT_ICE_SERVERS,
  [ESettingKey.INVITE_ONLY_SIGN_UP]: DEFAULT_INVITE_ONLY_SIGN_UP,
  [ESettingKey.PASSWORD_RECOVERY_CODE_TTL]: DEFAULT_PASSWORD_RECOVERY_CODE_TTL,
} as const;

export type TSettingValueMap = {
  [K in ESettingKey]: z.infer<(typeof settingValueSchemas)[K]>;
};

export const settingSchema = z.discriminatedUnion('key', [
  iceServersSettingSchema,
  inviteOnlySignUpSettingSchema,
  passwordRecoveryCodeTtlSettingSchema,
]);
export type TSetting = z.infer<typeof settingSchema>;
export type TSettingByKey<K extends ESettingKey> = Extract<
  TSetting,
  { key: K }
>;

export const settingItemUpdateSchema = z.discriminatedUnion('key', [
  iceServersSettingBaseSchema,
  inviteOnlySignUpSettingBaseSchema,
  passwordRecoveryCodeTtlSettingBaseSchema,
]);
export type TSettingItemUpdate = z.infer<typeof settingItemUpdateSchema>;

export const settingsUpdateSchema = z.array(settingItemUpdateSchema);
export type TSettingsUpdate = z.infer<typeof settingsUpdateSchema>;
