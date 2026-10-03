import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { MessageEntitySchema } from '../text-rooms/text-rooms.entity';
import { UserEntitySchema } from '../users/users.entity';

export const MessageAttachmentEntitySchema = defineEntity({
  name: 'MessageAttachmentEntity',
  tableName: 'message_attachments',
  extends: KonvoezBaseEntitySchema,
  indexes: [
    { properties: ['message', 'position'] },
    { properties: ['status', 'createdAt'] },
    { properties: ['uploader', 'status'] },
  ],
  properties: {
    id: p.uint8array().length(16).primary(),
    message: () =>
      p
        .manyToOne(MessageEntitySchema)
        .nullable()
        .updateRule('cascade')
        .deleteRule('set null'),
    uploader: () =>
      p.manyToOne(UserEntitySchema).nullable().deleteRule('set null'),
    status: p.string().length(16),
    position: p.integer().default(0),
    kind: p.string().length(16),
    mime: p.string().length(255),
    size: p.bigint('number'),
    originalName: p.string().length(255),
    storageKey: p.string().length(512),
    thumbnailKey: p.string().length(512).nullable(),
    width: p.integer().nullable(),
    height: p.integer().nullable(),
    durationMs: p.integer().nullable(),
  },
});

export class MessageAttachmentEntity
  extends MessageAttachmentEntitySchema.class {}
MessageAttachmentEntitySchema.setClass(MessageAttachmentEntity);
