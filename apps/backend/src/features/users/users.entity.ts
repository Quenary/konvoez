import {
  Cascade,
  Entity,
  Enum,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { EUserRole } from '@konvoez/common';
import { KonvoezBaseEntity } from '../../shared/types/base.entity';
import { RoomEntity } from '../rooms/rooms.entity';
import { MessageEntity } from '../text-rooms/text-rooms.entity';

@Entity({ tableName: 'users' })
export class UserEntity extends KonvoezBaseEntity {
  @PrimaryKey({ type: 'int', autoincrement: true })
  id!: number;

  @Property({ length: 32, index: true, unique: true })
  username!: string;

  @Property({ length: 128, hidden: true })
  password!: string;

  @Enum(() => EUserRole)
  role: EUserRole = EUserRole.MEMBER;

  @Property({ length: 512, index: true, type: 'string' })
  avatar: string | null = null;

  @OneToMany(() => RoomEntity, 'author', {
    cascade: [Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL],
  })
  rooms?: RoomEntity[];

  @OneToMany(() => MessageEntity, 'sender', {
    cascade: [Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL],
  })
  messages?: MessageEntity[];
}
