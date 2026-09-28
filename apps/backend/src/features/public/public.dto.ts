import { createZodDto } from 'nestjs-zod';
import { publicSettingsSchema, publicVersionSchema } from '@konvoez/shared';

export class PublicSettingsDto extends createZodDto(publicSettingsSchema) {}

export class PublicVersionDto extends createZodDto(publicVersionSchema) {}
