import { defineEntity, p, Cascade } from '@mikro-orm/core';
import { IUserSafe } from '@konvoez/shared';
import { KonvoezBaseEntitySchema } from '../../shared/types/base.entity';
import { RoomEntitySchema } from '../rooms/rooms.entity';
import { MessageEntitySchema } from '../text-rooms/text-rooms.entity';
import { RoleEntitySchema } from '../roles/roles.entity';

export const UserEntitySchema = defineEntity({
  name: 'UserEntity',
  tableName: 'users',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    username: p.string().length(32).index().unique(),
    password: p.string().length(128).hidden(),
    sessionVersion: p.integer().default(0).hidden(),
    fullname: p.string().length(128).index(),
    email: p.string().length(128).index().unique(),
    isOwner: p.boolean().default(false),
    roles: () =>
      p
        .manyToMany(RoleEntitySchema)
        .pivotTable('user_roles')
        .joinColumn('user_id')
        .inverseJoinColumn('role_id'),
    avatar: p.string().length(512).nullable(),
    deletedAt: p.datetime().nullable(),
    twoFactorSecret: p.text().nullable().hidden(),
    twoFactorEnabledAt: p.datetime().nullable().hidden(),
    twoFactorLastStep: p.integer().nullable().hidden(),

    rooms: () =>
      p
        .oneToMany(RoomEntitySchema)
        .mappedBy('author')
        .cascade(Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL)
        .nullable(),

    messages: () =>
      p
        .oneToMany(MessageEntitySchema)
        .mappedBy('sender')
        .cascade(Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL)
        .nullable(),
  },
});

export class UserEntity
  extends UserEntitySchema.class
  implements Omit<IUserSafe, 'avatarUrl' | 'roles' | 'permissions'> {}

UserEntitySchema.setClass(UserEntity);
