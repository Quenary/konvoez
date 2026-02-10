import { Cascade, Entity, Enum, ManyToOne, Property } from '@mikro-orm/core';
import { ERoomType } from '@common/enums';
import { KonvoezBaseEntity } from '../../shared/types/base.entity';
import { UserEntity } from '../users/users.entity';

@Entity({ tableName: 'rooms' })
export class RoomEntity extends KonvoezBaseEntity {
  @Property({ length: 64, index: true, unique: true })
  name!: string;

  @Enum(() => ERoomType)
  type!: ERoomType;

  @ManyToOne(() => UserEntity, {
    cascade: [Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL],
  })
  author!: UserEntity;
}
