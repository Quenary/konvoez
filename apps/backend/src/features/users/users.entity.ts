import { defineEntity, p, Cascade } from '@mikro-orm/core';
import { EUserRole, IUser } from '@konvoez/shared';
import { KonvoezBaseEntitySchema } from '../../shared/types/base.entity';
import { RoomEntitySchema } from '../rooms/rooms.entity';
import { MessageEntitySchema } from '../text-rooms/text-rooms.entity';

export const UserEntitySchema = defineEntity({
  name: 'UserEntity',
  tableName: 'users',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    username: p.string().length(32).index().unique(),
    password: p.string().length(128).hidden(),
    fullname: p.string().length(128).index(),
    email: p.string().length(128).index().unique(),
    role: p.enum(() => EUserRole).default(EUserRole.MEMBER),
    avatar: p.string().length(512).nullable(),

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
  implements Omit<IUser, 'avatarUrl'> {}

UserEntitySchema.setClass(UserEntity);
