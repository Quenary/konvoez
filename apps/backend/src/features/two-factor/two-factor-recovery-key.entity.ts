import { defineEntity, p } from '@mikro-orm/core';

export const TwoFactorRecoveryKeyEntitySchema = defineEntity({
  name: 'TwoFactorRecoveryKeyEntity',
  tableName: 'two_factor_recovery_key',
  properties: {
    id: p.integer().primary(),
    wrapped: p.text(),
  },
});

export class TwoFactorRecoveryKeyEntity
  extends TwoFactorRecoveryKeyEntitySchema.class {}

TwoFactorRecoveryKeyEntitySchema.setClass(TwoFactorRecoveryKeyEntity);
