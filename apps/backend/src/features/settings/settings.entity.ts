import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { ESettingKey, TSetting } from '@konvoez/shared';

export const SettingsEntitySchema = defineEntity({
  name: 'SettingsEntity',
  tableName: 'settings',
  extends: KonvoezBaseEntitySchema,
  properties: {
    // Plain string PK (not enum): avoids DB CHECK constraints that block new keys.
    // Valid keys are enforced in app code via ESettingKey / Zod schemas.
    key: p.string().primary(),
    value: p.json<TSetting['value']>(),
  },
});

export class SettingsEntity extends SettingsEntitySchema.class {
  declare key: ESettingKey;
}

SettingsEntitySchema.setClass(SettingsEntity);
