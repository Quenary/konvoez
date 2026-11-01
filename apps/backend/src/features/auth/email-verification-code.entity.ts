import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { UserEntity, UserEntitySchema } from '../users/users.entity';

export const EmailVerificationCodeEntitySchema = defineEntity({
  name: 'EmailVerificationCodeEntity',
  tableName: 'email_verification_codes',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    user: () =>
      p.manyToOne(UserEntitySchema).updateRule('cascade').deleteRule('cascade'),
    email: p.string().length(128).index(),
    codeHash: p.string().length(128),
    attempts: p.integer().default(0),
    expiresAt: p.datetime(),
    usedAt: p.datetime().nullable().default(null),
  },
});

export class EmailVerificationCodeEntity
  extends EmailVerificationCodeEntitySchema.class
{
  declare user: UserEntity;
}

EmailVerificationCodeEntitySchema.setClass(EmailVerificationCodeEntity);
