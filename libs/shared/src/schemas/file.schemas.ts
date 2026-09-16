import { z } from 'zod';
import { stringSchema } from './base.schemas';

export const uploadFileResultSchema = z.object({
  key: stringSchema,
  url: stringSchema,
});

export type IUploadFileResult = z.infer<typeof uploadFileResultSchema>;
