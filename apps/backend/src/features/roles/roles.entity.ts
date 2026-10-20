import { defineEntity, p } from '@mikro-orm/core';
import { EPermission } from '@konvoez/shared';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';

export const RoleEntitySchema = defineEntity({
  name: 'RoleEntity',
  tableName: 'roles',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    name: p.string().length(64).index().unique(),
    color: p.string().length(32).nullable(),
    priority: p.integer().default(0),
    isDefault: p.boolean().default(false),
    mentionable: p.boolean().default(false),
    permissions: p.json<EPermission[]>().default('[]'),
  },
});

export class RoleEntity extends RoleEntitySchema.class {}
RoleEntitySchema.setClass(RoleEntity);
