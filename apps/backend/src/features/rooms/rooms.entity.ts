import { defineEntity, p, Cascade } from '@mikro-orm/core';
import { ERoomType } from '@konvoez/shared';
import { UserEntitySchema } from '../users/users.entity';
import { MessageEntitySchema } from '../text-rooms/text-rooms.entity';
import { RoleEntitySchema } from '../roles/roles.entity';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';

export const RoomEntitySchema = defineEntity({
  name: 'RoomEntity',
  tableName: 'rooms',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    name: p.string().length(64).index().unique(),
    type: p.enum(() => ERoomType),
    avatar: p.string().length(512).nullable(),
    author: () => p.manyToOne(UserEntitySchema),
    isPrivate: p.boolean().default(false),
    allowedRoles: () =>
      p
        .manyToMany(RoleEntitySchema)
        .pivotTable('room_allowed_roles')
        .joinColumn('room_id')
        .inverseJoinColumn('role_id'),
    allowedUsers: () =>
      p
        .manyToMany(UserEntitySchema)
        .pivotTable('room_allowed_users')
        .joinColumn('room_id')
        .inverseJoinColumn('user_id'),
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
