import { createZodDto } from 'nestjs-zod';
import {
  settingsUpdateSchema,
  iceServersSettingSchema,
  inviteOnlySignUpSettingSchema,
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
