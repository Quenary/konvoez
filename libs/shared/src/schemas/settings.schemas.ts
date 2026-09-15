import { z } from 'zod';

export enum ESettingKey {
  ICE_SERVERS = 'ICE_SERVERS',
}

export const iceServerSchema = z.object({
  urls: z.union([z.string(), z.array(z.string())]),
  username: z.string().optional(),
  credential: z.string().optional(),
  credentialType: z.enum(['password', 'oauth']).optional(),
});
export type TIceServer = z.infer<typeof iceServerSchema>;

export const iceServersSettingValueSchema = z.array(iceServerSchema);
export type TIceServersSettingValue = z.infer<
  typeof iceServersSettingValueSchema
>;

export const DEFAULT_ICE_SERVERS: TIceServersSettingValue = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

export const iceServersSettingSchema = z.object({
  key: z.literal(ESettingKey.ICE_SERVERS),
  value: iceServersSettingValueSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullish(),
});
export type TIceServersSetting = z.infer<typeof iceServersSettingSchema>;

export const iceServersSettingUpdateSchema = z.object({
  value: iceServersSettingValueSchema,
});
export type TIceServersSettingUpdate = z.infer<
  typeof iceServersSettingUpdateSchema
>;

export const settingValueSchemas = {
  [ESettingKey.ICE_SERVERS]: iceServersSettingValueSchema,
} as const;

export const defaultSettingValues = {
  [ESettingKey.ICE_SERVERS]: DEFAULT_ICE_SERVERS,
} as const;

export const settingUpdateSchemas = {
  [ESettingKey.ICE_SERVERS]: iceServersSettingUpdateSchema,
} as const;

export type TSettingValueMap = {
  [K in ESettingKey]: z.infer<(typeof settingValueSchemas)[K]>;
};

export const settingSchema = z.discriminatedUnion('key', [
  iceServersSettingSchema,
]);
export type TSetting = z.infer<typeof settingSchema>;

export const settingsUpdateSchema = z.object({
  value: z.unknown(),
});
export type TSettingsUpdate = z.infer<typeof settingsUpdateSchema>;
