import { z } from 'zod';
import {
  attachmentsMaxVideoDurationSeconds,
  attachmentsMaxVideoSide,
} from '../const';
import { EAttachmentKind } from '../enums';
import { stringSchema } from './base.schemas';

const videoSideHint = looseHint(
  z.coerce.number().int().min(1).max(attachmentsMaxVideoSide),
);

const videoDurationHint = looseHint(
  z.coerce.number().gt(0).lte(attachmentsMaxVideoDurationSeconds),
);

function looseHint<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data : undefined;
  }, schema.optional());
}

export const attachmentUploadHintsSchema = z.object({
  videoWidth: videoSideHint,
  videoHeight: videoSideHint,
  videoDuration: videoDurationHint,
});
export type IAttachmentUploadHints = z.infer<
  typeof attachmentUploadHintsSchema
>;

export const attachmentKindSchema = z.enum(EAttachmentKind);
export const attachmentSchema = z.object({
  id: z.uuid(),
  kind: attachmentKindSchema,
  name: stringSchema,
  mime: stringSchema,
  size: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().positive().nullable(),
  url: stringSchema,
  thumbnailUrl: stringSchema.nullable(),
});
export type IAttachment = z.infer<typeof attachmentSchema>;
