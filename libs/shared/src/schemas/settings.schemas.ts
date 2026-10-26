import * as z from 'zod';
import { baseEntitySchema, SCHEMA_ERROR, stringSchema } from './base.schemas';
import { ESettingKey } from '../enums';
import {
  attachmentsDefaultMaxFileSize,
  attachmentsDefaultMaxFilesPerMessage,
  attachmentsMaxFileSizeHardLimit,
  attachmentsMaxFilesHardLimit,
  attachmentsMinFileSize,
  passwordRecoveryCodeDefaultTtl,
  passwordRecoveryCodeMaxTtl,
  passwordRecoveryCodeMinTtl,
  voiceBitrateDefaultKbps,
  voiceBitrateMaxKbps,
  voiceBitrateMinKbps,
} from '../const';

export const settingMetaSchema = z.object({
  envLocked: z.boolean(),
});

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

export const iceServersSettingSchema = iceServersSettingBaseSchema
  .extend(baseEntitySchema.shape)
  .extend(settingMetaSchema.shape);
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

export const inviteOnlySignUpSettingSchema = inviteOnlySignUpSettingBaseSchema
  .extend(baseEntitySchema.shape)
  .extend(settingMetaSchema.shape);
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
  passwordRecoveryCodeTtlSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape);
export type TPasswordRecoveryCodeTtlSetting = z.infer<
  typeof passwordRecoveryCodeTtlSettingSchema
>;

/* ==========================================================================
   VAPID Email Setting
   ========================================================================== */

export const vapidEmailSettingValueSchema = z
  .string({ error: SCHEMA_ERROR.VAPID_SUBJECT })
  .trim()
  .refine(
    (value) =>
      value === '' ||
      z.email().safeParse(value).success ||
      /^https:\/\/[^\s]+$/.test(value) ||
      (value.startsWith('mailto:') &&
        z.email().safeParse(value.slice('mailto:'.length)).success),
    { error: SCHEMA_ERROR.VAPID_SUBJECT },
  );
export type TVapidEmailSettingValue = z.infer<
  typeof vapidEmailSettingValueSchema
>;

export const DEFAULT_VAPID_EMAIL: TVapidEmailSettingValue = '';

export const vapidEmailSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.VAPID_EMAIL),
  value: vapidEmailSettingValueSchema,
});

export const vapidEmailSettingSchema = vapidEmailSettingBaseSchema
  .extend(baseEntitySchema.shape)
  .extend(settingMetaSchema.shape);
export type TVapidEmailSetting = z.infer<typeof vapidEmailSettingSchema>;

export function toVapidSubject(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith('https://') || normalized.startsWith('mailto:')) {
    return normalized;
  }
  if (z.email().safeParse(normalized).success) {
    return `mailto:${normalized}`;
  }
  return null;
}

/* ==========================================================================
   Attachments Enabled
   ========================================================================== */

export const attachmentsEnabledSettingValueSchema = z.boolean();
export type TAttachmentsEnabledSettingValue = z.infer<
  typeof attachmentsEnabledSettingValueSchema
>;

export const DEFAULT_ATTACHMENTS_ENABLED: TAttachmentsEnabledSettingValue = true;

export const attachmentsEnabledSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.ATTACHMENTS_ENABLED),
  value: attachmentsEnabledSettingValueSchema,
});

export const attachmentsEnabledSettingSchema =
  attachmentsEnabledSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape);
export type TAttachmentsEnabledSetting = z.infer<
  typeof attachmentsEnabledSettingSchema
>;

/* ==========================================================================
   Attachments Max File Size
   ========================================================================== */

export const attachmentsMaxFileSizeSettingValueSchema = z
  .number({ error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE })
  .int({ error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE })
  .min(attachmentsMinFileSize, {
    error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE,
  })
  .max(attachmentsMaxFileSizeHardLimit, {
    error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILE_SIZE_RANGE,
  });
export type TAttachmentsMaxFileSizeSettingValue = z.infer<
  typeof attachmentsMaxFileSizeSettingValueSchema
>;

export const DEFAULT_ATTACHMENTS_MAX_FILE_SIZE: TAttachmentsMaxFileSizeSettingValue =
  attachmentsDefaultMaxFileSize;

export const attachmentsMaxFileSizeSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.ATTACHMENTS_MAX_FILE_SIZE),
  value: attachmentsMaxFileSizeSettingValueSchema,
});

export const attachmentsMaxFileSizeSettingSchema =
  attachmentsMaxFileSizeSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape);
export type TAttachmentsMaxFileSizeSetting = z.infer<
  typeof attachmentsMaxFileSizeSettingSchema
>;

/* ==========================================================================
   Attachments Max Files Per Message
   ========================================================================== */

export const attachmentsMaxFilesPerMessageSettingValueSchema = z
  .number({ error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILES_RANGE })
  .int({ error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILES_RANGE })
  .min(1, { error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILES_RANGE })
  .max(attachmentsMaxFilesHardLimit, {
    error: SCHEMA_ERROR.ATTACHMENTS_MAX_FILES_RANGE,
  });
export type TAttachmentsMaxFilesPerMessageSettingValue = z.infer<
  typeof attachmentsMaxFilesPerMessageSettingValueSchema
>;

export const DEFAULT_ATTACHMENTS_MAX_FILES_PER_MESSAGE: TAttachmentsMaxFilesPerMessageSettingValue =
  attachmentsDefaultMaxFilesPerMessage;

export const attachmentsMaxFilesPerMessageSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE),
  value: attachmentsMaxFilesPerMessageSettingValueSchema,
});

export const attachmentsMaxFilesPerMessageSettingSchema =
  attachmentsMaxFilesPerMessageSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape);
export type TAttachmentsMaxFilesPerMessageSetting = z.infer<
  typeof attachmentsMaxFilesPerMessageSettingSchema
>;

/* ==========================================================================
   Attachments Strip Image Metadata
   ========================================================================== */

export const attachmentsStripImageMetadataSettingValueSchema = z.boolean();
export type TAttachmentsStripImageMetadataSettingValue = z.infer<
  typeof attachmentsStripImageMetadataSettingValueSchema
>;

export const DEFAULT_ATTACHMENTS_STRIP_IMAGE_METADATA: TAttachmentsStripImageMetadataSettingValue = false;

export const attachmentsStripImageMetadataSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA),
  value: attachmentsStripImageMetadataSettingValueSchema,
});

export const attachmentsStripImageMetadataSettingSchema =
  attachmentsStripImageMetadataSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape);
export type TAttachmentsStripImageMetadataSetting = z.infer<
  typeof attachmentsStripImageMetadataSettingSchema
>;

/* ==========================================================================
   Voice Max Bitrate (Kbps)
   ========================================================================== */

export const voiceMaxBitrateKbpsSettingValueSchema = z
  .number({ error: SCHEMA_ERROR.VOICE_MAX_BITRATE_RANGE })
  .int({ error: SCHEMA_ERROR.VOICE_MAX_BITRATE_RANGE })
  .min(voiceBitrateMinKbps, {
    error: SCHEMA_ERROR.VOICE_MAX_BITRATE_RANGE,
  })
  .max(voiceBitrateMaxKbps, {
    error: SCHEMA_ERROR.VOICE_MAX_BITRATE_RANGE,
  });
export type TVoiceMaxBitrateKbpsSettingValue = z.infer<
  typeof voiceMaxBitrateKbpsSettingValueSchema
>;

export const DEFAULT_VOICE_MAX_BITRATE_KBPS: TVoiceMaxBitrateKbpsSettingValue =
  voiceBitrateDefaultKbps;

export const voiceMaxBitrateKbpsSettingBaseSchema = z.object({
  key: z.literal(ESettingKey.VOICE_MAX_BITRATE_KBPS),
  value: voiceMaxBitrateKbpsSettingValueSchema,
});

export const voiceMaxBitrateKbpsSettingSchema =
  voiceMaxBitrateKbpsSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape);
export type TVoiceMaxBitrateKbpsSetting = z.infer<
  typeof voiceMaxBitrateKbpsSettingSchema
>;

/* ==========================================================================
   Maps, Unions & Bulk Update Schemas
   ========================================================================== */

export const settingValueSchemas = {
  [ESettingKey.ICE_SERVERS]: iceServersSettingValueSchema,
  [ESettingKey.INVITE_ONLY_SIGN_UP]: inviteOnlySignUpSettingValueSchema,
  [ESettingKey.PASSWORD_RECOVERY_CODE_TTL]:
    passwordRecoveryCodeTtlSettingValueSchema,
  [ESettingKey.VAPID_EMAIL]: vapidEmailSettingValueSchema,
  [ESettingKey.ATTACHMENTS_ENABLED]: attachmentsEnabledSettingValueSchema,
  [ESettingKey.ATTACHMENTS_MAX_FILE_SIZE]:
    attachmentsMaxFileSizeSettingValueSchema,
  [ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE]:
    attachmentsMaxFilesPerMessageSettingValueSchema,
  [ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA]:
    attachmentsStripImageMetadataSettingValueSchema,
  [ESettingKey.VOICE_MAX_BITRATE_KBPS]: voiceMaxBitrateKbpsSettingValueSchema,
} as const;

export const defaultSettingValues = {
  [ESettingKey.ICE_SERVERS]: DEFAULT_ICE_SERVERS,
  [ESettingKey.INVITE_ONLY_SIGN_UP]: DEFAULT_INVITE_ONLY_SIGN_UP,
  [ESettingKey.PASSWORD_RECOVERY_CODE_TTL]: DEFAULT_PASSWORD_RECOVERY_CODE_TTL,
  [ESettingKey.VAPID_EMAIL]: DEFAULT_VAPID_EMAIL,
  [ESettingKey.ATTACHMENTS_ENABLED]: DEFAULT_ATTACHMENTS_ENABLED,
  [ESettingKey.ATTACHMENTS_MAX_FILE_SIZE]: DEFAULT_ATTACHMENTS_MAX_FILE_SIZE,
  [ESettingKey.ATTACHMENTS_MAX_FILES_PER_MESSAGE]:
    DEFAULT_ATTACHMENTS_MAX_FILES_PER_MESSAGE,
  [ESettingKey.ATTACHMENTS_STRIP_IMAGE_METADATA]:
    DEFAULT_ATTACHMENTS_STRIP_IMAGE_METADATA,
  [ESettingKey.VOICE_MAX_BITRATE_KBPS]: DEFAULT_VOICE_MAX_BITRATE_KBPS,
} as const;

export type TSettingValueMap = {
  [K in ESettingKey]: z.infer<(typeof settingValueSchemas)[K]>;
};

const settingSchemaEntries = [
  iceServersSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  inviteOnlySignUpSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  passwordRecoveryCodeTtlSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  vapidEmailSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  attachmentsEnabledSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  attachmentsMaxFileSizeSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  attachmentsMaxFilesPerMessageSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  attachmentsStripImageMetadataSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
  voiceMaxBitrateKbpsSettingBaseSchema
    .extend(baseEntitySchema.shape)
    .extend(settingMetaSchema.shape),
] as const;

export const settingSchema = z.discriminatedUnion('key', settingSchemaEntries);
export type TSetting = z.infer<typeof settingSchema>;
export type TSettingByKey<K extends ESettingKey> = Extract<
  TSetting,
  { key: K }
>;

export const settingItemUpdateSchema = z.discriminatedUnion('key', [
  iceServersSettingBaseSchema,
  inviteOnlySignUpSettingBaseSchema,
  passwordRecoveryCodeTtlSettingBaseSchema,
  vapidEmailSettingBaseSchema,
  attachmentsEnabledSettingBaseSchema,
  attachmentsMaxFileSizeSettingBaseSchema,
  attachmentsMaxFilesPerMessageSettingBaseSchema,
  attachmentsStripImageMetadataSettingBaseSchema,
  voiceMaxBitrateKbpsSettingBaseSchema,
]);
export type TSettingItemUpdate = z.infer<typeof settingItemUpdateSchema>;

export const settingsUpdateSchema = z.array(settingItemUpdateSchema);
export type TSettingsUpdate = z.infer<typeof settingsUpdateSchema>;
