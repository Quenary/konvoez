import { z } from 'zod';

export const uploadFileResultSchema = z.object({
  key: z.string(),
  url: z.string(),
});

export type IUploadFileResult = z.infer<typeof uploadFileResultSchema>;
