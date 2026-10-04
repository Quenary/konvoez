import { createZodDto } from 'nestjs-zod';
import { attachmentSchema } from '@konvoez/shared';

export class AttachmentDto extends createZodDto(attachmentSchema) {}
