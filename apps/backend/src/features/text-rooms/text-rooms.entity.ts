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
import { v7, parse } from 'uuid';

@Entity({ tableName: 'messages' })
@Index({ properties: ['room', 'id'] })
@Index({ properties: ['recipient', 'id'] })
@Index({ properties: ['sender', 'id'] })
@Index({ properties: ['sender', 'createdAt'] })
@Index({ properties: ['recipient', 'createdAt'] })
@Index({ properties: ['room', 'createdAt'] })
export class MessageEntity extends KonvoezBaseEntity {
  @PrimaryKey({
    type: 'uint8array',
    length: 16,
    onCreate: () => parse(v7()),
  })
  id!: Uint8Array;

  /**
   * Encrypted content
   */
  @Property({ type: 'uint8array' })
  contentEncrypted!: Uint8Array;

  /**
   * initialization vector
   */
  @Property({ type: 'uint8array' })
  iv!: Uint8Array;

  @Property({ type: 'uint8array' })
  authTag!: Uint8Array;

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
