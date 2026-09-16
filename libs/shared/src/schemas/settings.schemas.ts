import { z } from 'zod';
import { baseEntitySchema, SCHEMA_ERROR, stringSchema } from './base.schemas';

export enum ESettingKey {
  ICE_SERVERS = 'ICE_SERVERS',
  INVITE_ONLY_SIGN_UP = 'INVITE_ONLY_SIGN_UP',
}

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
];

export const iceServersSettingSchema = baseEntitySchema.extend({
  key: z.literal(ESettingKey.ICE_SERVERS),
  value: iceServersSettingValueSchema,
});
export type TIceServersSetting = z.infer<typeof iceServersSettingSchema>;

export const iceServersSettingUpdateSchema = z.object({
  value: iceServersSettingValueSchema,
});
export type TIceServersSettingUpdate = z.infer<
  typeof iceServersSettingUpdateSchema
>;

export const inviteOnlySignUpSettingValueSchema = z.boolean();
export type TInviteOnlySignUpSettingValue = z.infer<
  typeof inviteOnlySignUpSettingValueSchema
>;

export const DEFAULT_INVITE_ONLY_SIGN_UP: TInviteOnlySignUpSettingValue = true;

export const inviteOnlySignUpSettingSchema = baseEntitySchema.extend({
  key: z.literal(ESettingKey.INVITE_ONLY_SIGN_UP),
  value: inviteOnlySignUpSettingValueSchema,
});
export type TInviteOnlySignUpSetting = z.infer<
  typeof inviteOnlySignUpSettingSchema
>;

export const inviteOnlySignUpSettingUpdateSchema = z.object({
  value: inviteOnlySignUpSettingValueSchema,
});
export type TInviteOnlySignUpSettingUpdate = z.infer<
  typeof inviteOnlySignUpSettingUpdateSchema
>;

export const settingValueSchemas = {
  [ESettingKey.ICE_SERVERS]: iceServersSettingValueSchema,
  [ESettingKey.INVITE_ONLY_SIGN_UP]: inviteOnlySignUpSettingValueSchema,
} as const;

export const defaultSettingValues = {
  [ESettingKey.ICE_SERVERS]: DEFAULT_ICE_SERVERS,
  [ESettingKey.INVITE_ONLY_SIGN_UP]: DEFAULT_INVITE_ONLY_SIGN_UP,
} as const;

export const settingUpdateSchemas = {
  [ESettingKey.ICE_SERVERS]: iceServersSettingUpdateSchema,
  [ESettingKey.INVITE_ONLY_SIGN_UP]: inviteOnlySignUpSettingUpdateSchema,
} as const;

export type TSettingValueMap = {
  [K in ESettingKey]: z.infer<(typeof settingValueSchemas)[K]>;
};

export const settingSchema = z.discriminatedUnion('key', [
  iceServersSettingSchema,
  inviteOnlySignUpSettingSchema,
]);
export type TSetting = z.infer<typeof settingSchema>;
export type TSettingByKey<K extends ESettingKey> = Extract<
  TSetting,
  { key: K }
>;

export const settingsUpdateSchema = z.object({
  value: z.unknown(),
});
export type TSettingsUpdate = z.infer<typeof settingsUpdateSchema>;
