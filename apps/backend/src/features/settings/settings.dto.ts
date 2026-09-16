import { createZodDto } from 'nestjs-zod';
import {
  settingsUpdateSchema,
  iceServersSettingSchema,
  iceServersSettingUpdateSchema,
  inviteOnlySignUpSettingSchema,
  inviteOnlySignUpSettingUpdateSchema,
  TSetting,
  TSettingByKey,
} from '@konvoez/shared';

export type SettingsDto = TSetting;
export type { TSettingByKey };

export class SettingsUpdateDto extends createZodDto(settingsUpdateSchema) {}

export class IceServersSettingDto extends createZodDto(
  iceServersSettingSchema,
) {}

export class IceServersSettingUpdateDto extends createZodDto(
  iceServersSettingUpdateSchema,
) {}

export class InviteOnlySignUpSettingDto extends createZodDto(
  inviteOnlySignUpSettingSchema,
) {}

export class InviteOnlySignUpSettingUpdateDto extends createZodDto(
  inviteOnlySignUpSettingUpdateSchema,
) {}
