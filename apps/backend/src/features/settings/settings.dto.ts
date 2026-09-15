import { createZodDto } from 'nestjs-zod';
import {
  settingSchema,
  settingsUpdateSchema,
  iceServersSettingSchema,
  iceServersSettingUpdateSchema,
} from '@konvoez/shared';

export class SettingsDto extends createZodDto(settingSchema) {}

export class SettingsUpdateDto extends createZodDto(settingsUpdateSchema) {}

export class IceServersSettingDto extends createZodDto(
  iceServersSettingSchema,
) {}

export class IceServersSettingUpdateDto extends createZodDto(
  iceServersSettingUpdateSchema,
) {}
