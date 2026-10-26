import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { UserEntity, UserEntitySchema } from '../users/users.entity';

export const TwoFactorRecoveryCodeEntitySchema = defineEntity({
  name: 'TwoFactorRecoveryCodeEntity',
  tableName: 'two_factor_recovery_codes',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    user: () =>
      p.manyToOne(UserEntitySchema).updateRule('cascade').deleteRule('cascade'),
    codeHash: p.string().length(128).index(),
    usedAt: p.datetime().nullable().default(null),
  },
});

export class TwoFactorRecoveryCodeEntity
  extends TwoFactorRecoveryCodeEntitySchema.class
{
  declare user: UserEntity;
}

TwoFactorRecoveryCodeEntitySchema.setClass(TwoFactorRecoveryCodeEntity);
