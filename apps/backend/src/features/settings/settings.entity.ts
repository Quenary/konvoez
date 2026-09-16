import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { ESettingKey, TSetting } from '@konvoez/shared';

export const SettingsEntitySchema = defineEntity({
  name: 'SettingsEntity',
  tableName: 'settings',
  extends: KonvoezBaseEntitySchema,
  properties: {
    key: p.enum(() => ESettingKey).primary(),
    value: p.json<TSetting['value']>(),
  },
});

export class SettingsEntity extends SettingsEntitySchema.class {}

SettingsEntitySchema.setClass(SettingsEntity);
