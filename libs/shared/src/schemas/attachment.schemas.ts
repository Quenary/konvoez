import { z } from 'zod';
import { EAttachmentKind } from '../enums';
import { stringSchema } from './base.schemas';

export const attachmentKindSchema = z.enum(EAttachmentKind);
export const attachmentSchema = z.object({
  id: z.uuid(),
  kind: attachmentKindSchema,
  name: stringSchema,
  mime: stringSchema,
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  url: stringSchema,
  thumbnailUrl: stringSchema.nullable(),
});
export type IAttachment = z.infer<typeof attachmentSchema>;
