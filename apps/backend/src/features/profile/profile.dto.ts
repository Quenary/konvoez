import { createZodDto } from 'nestjs-zod';
import { profileUpdateSchema } from '@konvoez/shared';

export class UpdateProfileDto extends createZodDto(profileUpdateSchema) {}
