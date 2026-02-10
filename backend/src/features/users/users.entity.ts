import { Entity, Enum, OneToMany, Property } from '@mikro-orm/core';
import { EUserRole } from './users.enum';
import { KonvoezBaseEntity } from '../../shared/types/base.entity';
import { RoomEntity } from '../rooms/rooms.entity';

@Entity({ tableName: 'users' })
export class UserEntity extends KonvoezBaseEntity {
  @Property({ length: 32, index: true, unique: true })
  username!: string;

  @Property({ length: 128, hidden: true })
  password!: string;

  @Enum(() => EUserRole)
  role!: EUserRole;

  @OneToMany(() => RoomEntity, 'author')
  rooms?: RoomEntity[];
}
