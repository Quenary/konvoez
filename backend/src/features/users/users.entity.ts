import { Cascade, Entity, Enum, OneToMany, Property } from '@mikro-orm/core';
import { EUserRole } from '@common/enums';
import { KonvoezBaseEntity } from '../../shared/types/base.entity';
import { RoomEntity } from '../rooms/rooms.entity';

@Entity({ tableName: 'users' })
export class UserEntity extends KonvoezBaseEntity {
  @Property({ length: 32, index: true, unique: true })
  username!: string;

  @Property({ length: 128, hidden: true })
  password!: string;

  @Enum(() => EUserRole)
  role: EUserRole = EUserRole.MEMBER;

  @OneToMany(() => RoomEntity, 'author', {
    cascade: [Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL],
  })
  rooms?: RoomEntity[];
}
