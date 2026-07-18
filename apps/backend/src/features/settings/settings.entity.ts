import {
  Entity,
  Enum,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import { KonvoezBaseEntity } from '@shared/types/base.entity';
import { SettingsCommon } from '@konvoez/shared';

@Entity({ tableName: 'settings' })
export class SettingsEntity
  extends KonvoezBaseEntity
  implements SettingsCommon.ISetting<SettingsCommon.EKey>
{
  @PrimaryKey({ type: 'int', autoincrement: true })
  readonly id!: number;

  @Enum({ items: () => SettingsCommon.EKey, unique: true })
  readonly key!: SettingsCommon.EKey;

  @Property({ type: 'json' })
  value!: SettingsCommon.TypeUnion;
}
