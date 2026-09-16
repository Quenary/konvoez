import { createZodDto } from 'nestjs-zod';
import { publicSettingsSchema } from '@konvoez/shared';

export class PublicSettingsDto extends createZodDto(publicSettingsSchema) {}
