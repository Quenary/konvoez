import * as z from 'zod';
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

export const mediaGalleryItemSchema = attachmentSchema.extend({
  messageId: z.uuid(),
  createdAt: z.string().datetime(),
});
export type IMediaGalleryItem = z.infer<typeof mediaGalleryItemSchema>;

export const mediaCountsSchema = z.object({
  image: z.number().int().nonnegative(),
  video: z.number().int().nonnegative(),
  audio: z.number().int().nonnegative(),
  file: z.number().int().nonnegative(),
});
export type IMediaCounts = z.infer<typeof mediaCountsSchema>;

export const mediaCountsQuerySchema = z
  .object({
    roomId: z.coerce.number().int().positive().optional(),
    recipientId: z.coerce.number().int().positive().optional(),
  })
  .refine(
    (data) =>
      (data.roomId !== undefined && data.recipientId === undefined) ||
      (data.roomId === undefined && data.recipientId !== undefined),
    { message: 'Exactly one of roomId or recipientId must be provided' },
  );
export type IMediaCountsQuery = z.infer<typeof mediaCountsQuerySchema>;

const normalizedKindSchema = z.preprocess(
  (val) => (typeof val === 'string' ? val.toUpperCase() : val),
  attachmentKindSchema,
);

export const mediaListQuerySchema = z
  .object({
    roomId: z.coerce.number().int().positive().optional(),
    recipientId: z.coerce.number().int().positive().optional(),
    type: normalizedKindSchema,
    cursor: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .refine(
    (data) =>
      (data.roomId !== undefined && data.recipientId === undefined) ||
      (data.roomId === undefined && data.recipientId !== undefined),
    { message: 'Exactly one of roomId or recipientId must be provided' },
  );
export type IMediaListQuery = z.infer<typeof mediaListQuerySchema>;

export const mediaListResponseSchema = z.object({
  items: z.array(mediaGalleryItemSchema),
  nextCursor: z.uuid().nullable(),
  hasMore: z.boolean(),
});
export type IMediaListResponse = z.infer<typeof mediaListResponseSchema>;
