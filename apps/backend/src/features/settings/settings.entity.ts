import { Entity, Enum, PrimaryKey, Property } from '@mikro-orm/core';
import { KonvoezBaseEntity } from 'src/shared/types/base.entity';
import { SettingsCommon } from '@konvoez/common';

@Entity({ tableName: 'settings' })
export class SettingsEntity
  extends KonvoezBaseEntity
  implements SettingsCommon.ISetting<any>
{
  @PrimaryKey({ type: 'int', autoincrement: true })
  readonly id!: number;

  @Enum({ items: () => SettingsCommon.EKey, unique: true })
  readonly key!: SettingsCommon.EKey;

  @Property({ type: 'json' })
  value!: unknown;
}
