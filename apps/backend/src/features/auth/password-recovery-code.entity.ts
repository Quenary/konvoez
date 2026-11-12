import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { UserEntity, UserEntitySchema } from '../users/users.entity';

export const PasswordRecoveryCodeEntitySchema = defineEntity({
  name: 'PasswordRecoveryCodeEntity',
  tableName: 'password_recovery_codes',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    user: () =>
      p.manyToOne(UserEntitySchema).updateRule('cascade').deleteRule('cascade'),
    codeHash: p.string().length(128),
    attempts: p.integer().default(0),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable().default(null),
  },
});

export class PasswordRecoveryCodeEntity
  extends PasswordRecoveryCodeEntitySchema.class
{
  declare user: UserEntity;
  declare attempts: number;
}

PasswordRecoveryCodeEntitySchema.setClass(PasswordRecoveryCodeEntity);
