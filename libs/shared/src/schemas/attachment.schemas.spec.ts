import { describe, expect, it } from 'vitest';
import { EAttachmentKind, EAttachmentStatus } from '../enums';
import {
  attachmentSchema,
  attachmentStatusSchema,
  mediaCountsQuerySchema,
  mediaCountsSchema,
  mediaGalleryItemSchema,
  mediaListQuerySchema,
  mediaListResponseSchema,
} from './attachment.schemas';

describe('attachment schemas', () => {
  describe('attachmentStatusSchema and attachmentSchema', () => {
    it('validates attachment statuses', () => {
      expect(
        attachmentStatusSchema.safeParse(EAttachmentStatus.PENDING).success,
      ).toBe(true);
      expect(
        attachmentStatusSchema.safeParse(EAttachmentStatus.ATTACHED).success,
      ).toBe(true);
      expect(
        attachmentStatusSchema.safeParse(EAttachmentStatus.DELETED).success,
      ).toBe(true);
      expect(attachmentStatusSchema.safeParse('UNKNOWN').success).toBe(false);
    });

    it('requires status to be specified', () => {
      const parsed = attachmentSchema.safeParse({
        id: '0192e2b3-7649-7cb1-9878-1428a1c97a92',
        kind: EAttachmentKind.IMAGE,
        name: 'test.png',
        mime: 'image/png',
        size: 100,
        width: 10,
        height: 10,
        durationMs: null,
        url: '/test',
        thumbnailUrl: null,
      });
      expect(parsed.success).toBe(false);
    });

    it('accepts explicit DELETED status', () => {
      const parsed = attachmentSchema.safeParse({
        id: '0192e2b3-7649-7cb1-9878-1428a1c97a92',
        status: EAttachmentStatus.DELETED,
        kind: EAttachmentKind.FILE,
        name: 'test.txt',
        mime: 'text/plain',
        size: 100,
        width: null,
        height: null,
        durationMs: null,
        url: '',
        thumbnailUrl: null,
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.status).toBe(EAttachmentStatus.DELETED);
      }
    });
  });
  describe('mediaCountsQuerySchema', () => {
    it('accepts roomId only', () => {
      const res = mediaCountsQuerySchema.safeParse({ roomId: '12' });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.roomId).toBe(12);
        expect(res.data.recipientId).toBeUndefined();
      }
    });

    it('accepts recipientId only', () => {
      const res = mediaCountsQuerySchema.safeParse({ recipientId: 42 });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.recipientId).toBe(42);
        expect(res.data.roomId).toBeUndefined();
      }
    });

    it('rejects neither or both', () => {
      expect(mediaCountsQuerySchema.safeParse({}).success).toBe(false);
      expect(
        mediaCountsQuerySchema.safeParse({ roomId: 1, recipientId: 2 }).success,
      ).toBe(false);
    });
  });

  describe('mediaListQuerySchema', () => {
    it('accepts valid query and normalizes type', () => {
      const res = mediaListQuerySchema.safeParse({
        roomId: 5,
        type: 'image',
        limit: '15',
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.roomId).toBe(5);
        expect(res.data.type).toBe(EAttachmentKind.IMAGE);
        expect(res.data.limit).toBe(15);
      }
    });

    it('accepts valid cursor', () => {
      const cursor = '0192e2b3-7649-7cb1-9878-1428a1c97a92';
      const res = mediaListQuerySchema.safeParse({
        recipientId: 10,
        type: EAttachmentKind.VIDEO,
        cursor,
      });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.cursor).toBe(cursor);
        expect(res.data.limit).toBe(30);
      }
    });

    it('rejects invalid cursor or missing type', () => {
      expect(
        mediaListQuerySchema.safeParse({ roomId: 1, cursor: 'invalid' })
          .success,
      ).toBe(false);
      expect(mediaListQuerySchema.safeParse({ roomId: 1 }).success).toBe(false);
    });
  });

  describe('mediaCountsSchema', () => {
    it('validates counts shape', () => {
      const res = mediaCountsSchema.safeParse({
        image: 10,
        video: 2,
        audio: 3,
        file: 0,
      });
      expect(res.success).toBe(true);
    });

    it('rejects negative counts', () => {
      expect(
        mediaCountsSchema.safeParse({
          image: -1,
          video: 0,
          audio: 0,
          file: 0,
        }).success,
      ).toBe(false);
    });
  });

  describe('mediaGalleryItemSchema and mediaListResponseSchema', () => {
    it('validates gallery item and response list', () => {
      const item = {
        id: '0192e2b3-7649-7cb1-9878-1428a1c97a92',
        status: EAttachmentStatus.ATTACHED,
        messageId: '0192e2b3-7649-7cb1-9878-1428a1c97a93',
        kind: EAttachmentKind.IMAGE,
        name: 'photo.jpg',
        mime: 'image/jpeg',
        size: 1024,
        width: 800,
        height: 600,
        durationMs: null,
        url: '/api/v1/attachments/test/content',
        thumbnailUrl: '/api/v1/attachments/test/thumbnail',
        createdAt: new Date().toISOString(),
      };
      expect(mediaGalleryItemSchema.safeParse(item).success).toBe(true);

      const response = {
        items: [item],
        nextCursor: '0192e2b3-7649-7cb1-9878-1428a1c97a92',
        hasMore: true,
      };
      expect(mediaListResponseSchema.safeParse(response).success).toBe(true);
    });
  });
});
