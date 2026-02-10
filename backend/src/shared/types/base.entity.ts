import { Entity, OptionalProps, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ abstract: true })
export abstract class KonvoezBaseEntity {
  [OptionalProps]?: 'createdAt' | 'updatedAt';

  @PrimaryKey({ type: 'int', autoincrement: true })
  id!: number;

  @Property({ onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ onUpdate: () => new Date(), nullable: true })
  updatedAt: Date | null = null;
}
