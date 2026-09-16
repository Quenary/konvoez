import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { UserEntity, UserEntitySchema } from '../users/users.entity';

export const InviteEntitySchema = defineEntity({
  name: 'InviteEntity',
  tableName: 'invites',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    code: p.string().length(64).unique().index(),
    email: p.string().length(128).nullable().index(),
    author: () => p.manyToOne(UserEntitySchema),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable().default(null),
    usedBy: () => p.manyToOne(UserEntitySchema).nullable().default(null),
    revokedAt: p.datetime().nullable().default(null),
  },
});

export class InviteEntity extends InviteEntitySchema.class {
  declare author: UserEntity;
  declare usedBy: UserEntity | null;
}

InviteEntitySchema.setClass(InviteEntity);
