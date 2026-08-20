import { createZodDto } from 'nestjs-zod';
import { uploadFileResultSchema } from '@konvoez/shared';

export class UploadFileResultDto extends createZodDto(uploadFileResultSchema) {}
