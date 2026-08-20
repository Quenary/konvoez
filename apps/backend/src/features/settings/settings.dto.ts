import { createZodDto } from 'nestjs-zod';
import { settingSchema, settingsUpdateSchema } from '@konvoez/shared';

export class SettingsDto extends createZodDto(settingSchema) {}

export class SettingsUpdateDto extends createZodDto(settingsUpdateSchema) {}
