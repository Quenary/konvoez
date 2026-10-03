import { createZodDto } from 'nestjs-zod';
import {
  settingsUpdateSchema,
  iceServersSettingSchema,
  inviteOnlySignUpSettingSchema,
  passwordRecoveryCodeTtlSettingSchema,
  attachmentsEnabledSettingSchema,
  attachmentsMaxFileSizeSettingSchema,
  attachmentsMaxFilesPerMessageSettingSchema,
  attachmentsStripImageMetadataSettingSchema,
  TSetting,
  TSettingByKey,
} from '@konvoez/shared';

export type SettingsDto = TSetting;
export type { TSettingByKey };

export class SettingsUpdateDto extends createZodDto(settingsUpdateSchema) {}

export class IceServersSettingDto extends createZodDto(
  iceServersSettingSchema,
) {}

export class InviteOnlySignUpSettingDto extends createZodDto(
  inviteOnlySignUpSettingSchema,
) {}

export class PasswordRecoveryCodeTtlSettingDto extends createZodDto(
  passwordRecoveryCodeTtlSettingSchema,
) {}

export class AttachmentsEnabledSettingDto extends createZodDto(
  attachmentsEnabledSettingSchema,
) {}

export class AttachmentsMaxFileSizeSettingDto extends createZodDto(
  attachmentsMaxFileSizeSettingSchema,
) {}

export class AttachmentsMaxFilesPerMessageSettingDto extends createZodDto(
  attachmentsMaxFilesPerMessageSettingSchema,
) {}

export class AttachmentsStripImageMetadataSettingDto extends createZodDto(
  attachmentsStripImageMetadataSettingSchema,
) {}
