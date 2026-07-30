import { defineEntity, p, Cascade } from '@mikro-orm/core';
import { ERoomType } from '@konvoez/shared';
import { UserEntitySchema } from '../users/users.entity';
import { MessageEntitySchema } from '../text-rooms/text-rooms.entity';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';

export const RoomEntitySchema = defineEntity({
  name: 'RoomEntity',
  tableName: 'rooms',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    name: p.string().length(64).index().unique(),
    type: p.enum(() => ERoomType),
    author: () => p.manyToOne(UserEntitySchema),
    messages: () =>
      p
        .oneToMany(MessageEntitySchema)
        .mappedBy('room')
        .cascade(Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL)
        .nullable(),
  },
});

export class RoomEntity extends RoomEntitySchema.class {}
RoomEntitySchema.setClass(RoomEntity);
