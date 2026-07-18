import {
  Entity,
  Enum,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import { ERoomType } from '@konvoez/shared';
import { KonvoezBaseEntity } from '../../shared/types/base.entity';
import { UserEntity } from '../users/users.entity';
import { MessageEntity } from '../text-rooms/text-rooms.entity';
import { Cascade } from '@mikro-orm/core';

@Entity({ tableName: 'rooms' })
export class RoomEntity extends KonvoezBaseEntity {
  @PrimaryKey({ type: 'int', autoincrement: true })
  id!: number;

  @Property({ type: 'string', length: 64, index: true, unique: true })
  name!: string;

  @Enum(() => ERoomType)
  type!: ERoomType;

  @ManyToOne(() => UserEntity)
  author!: UserEntity;

  @OneToMany(() => MessageEntity, 'room', {
    cascade: [Cascade.REMOVE, Cascade.SCHEDULE_ORPHAN_REMOVAL],
  })
  messages?: MessageEntity[];
}
