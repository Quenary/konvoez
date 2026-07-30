import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { UserEntitySchema } from '../users/users.entity';
import { RoomEntitySchema } from '../rooms/rooms.entity';
import { v7, parse } from 'uuid';

export const MessageEntitySchema = defineEntity({
  name: 'MessageEntity',
  tableName: 'messages',
  extends: KonvoezBaseEntitySchema,
  indexes: [
    { properties: ['room', 'id'] },
    { properties: ['recipient', 'id'] },
    { properties: ['sender', 'id'] },
    { properties: ['sender', 'createdAt'] },
    { properties: ['recipient', 'createdAt'] },
    { properties: ['room', 'createdAt'] },
  ],
  properties: {
    id: p
      .uint8array()
      .length(16)
      .primary()
      .onCreate(() => parse(v7())),

    /** Encrypted content */
    contentEncrypted: p.uint8array(),

    /** initialization vector */
    iv: p.uint8array(),

    authTag: p.uint8array(),

    sender: () => p.manyToOne(UserEntitySchema).index(),

    recipient: () => p.manyToOne(UserEntitySchema).index().nullable(),

    room: () => p.manyToOne(RoomEntitySchema).index().nullable(),
  },
});

MessageEntitySchema.addHook('beforeUpsert', (ev) => {
  if (!ev.entity.recipient && !ev.entity.room) {
    throw new Error('Message must have either a recipient or a chat room');
  }
  if (ev.entity.recipient && ev.entity.room) {
    throw new Error('Message cannot have both a recipient and a chat room');
  }
});

export class MessageEntity extends MessageEntitySchema.class {}

MessageEntitySchema.setClass(MessageEntity);
