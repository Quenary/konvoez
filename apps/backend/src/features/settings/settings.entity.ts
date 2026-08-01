import { defineEntity, p } from '@mikro-orm/core';
import { KonvoezBaseEntitySchema } from '@shared/types/base.entity';
import { ESettingKey } from '@konvoez/shared';

export const SettingsEntitySchema = defineEntity({
  name: 'SettingsEntity',
  tableName: 'settings',
  extends: KonvoezBaseEntitySchema,
  properties: {
    id: p.integer().primary().autoincrement(),
    key: p.enum(() => ESettingKey).unique(),
    value: p.json(),
  },
});

export class SettingsEntity extends SettingsEntitySchema.class {}

SettingsEntitySchema.setClass(SettingsEntity);
