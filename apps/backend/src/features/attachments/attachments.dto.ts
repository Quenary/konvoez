import { createZodDto } from 'nestjs-zod';
import {
  attachmentSchema,
  mediaCountsQuerySchema,
  mediaCountsSchema,
  mediaGalleryItemSchema,
  mediaListQuerySchema,
  mediaListResponseSchema,
} from '@konvoez/shared';

export class AttachmentDto extends createZodDto(attachmentSchema) {}

export class MediaGalleryItemDto extends createZodDto(mediaGalleryItemSchema) {}

export class MediaCountsQueryDto extends createZodDto(mediaCountsQuerySchema) {}

export class MediaCountsResponseDto extends createZodDto(mediaCountsSchema) {}

export class MediaListQueryDto extends createZodDto(mediaListQuerySchema) {}

export class MediaListResponseDto extends createZodDto(
  mediaListResponseSchema,
) {}
