import {
  BeforeCreate,
  BeforeUpdate,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/core';
import { KonvoezBaseEntity } from 'src/shared/types/base.entity';
import { UserEntity } from '../users/users.entity';
import { RoomEntity } from '../rooms/rooms.entity';
import { v4 } from 'uuid';

@Entity({ tableName: 'messages' })
@Index({ properties: ['sender', 'createdAt'] })
@Index({ properties: ['recipient', 'createdAt'] })
@Index({ properties: ['room', 'createdAt'] })
export class MessageEntity extends KonvoezBaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string = v4();

  @Property({ type: 'text' })
  content!: string;

  @ManyToOne(() => UserEntity, { index: true })
  sender!: UserEntity;

  @ManyToOne(() => UserEntity, { nullable: true, index: true })
  recipient?: UserEntity;

  @ManyToOne(() => RoomEntity, { nullable: true, index: true })
  room?: RoomEntity;

  @BeforeCreate()
  @BeforeUpdate()
  validateTarget() {
    if (!this.recipient && !this.room) {
      throw new Error('Message must have either a recipient or a chat room');
    }
    if (this.recipient && this.room) {
      throw new Error('Message cannot have both a recipient and a chat room');
    }
  }
}
