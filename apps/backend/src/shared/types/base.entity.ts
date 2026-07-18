import { OptionalProps } from '@mikro-orm/core';
import { Entity, Property } from '@mikro-orm/decorators/legacy';

@Entity({ abstract: true })
export abstract class KonvoezBaseEntity {
  [OptionalProps]?: 'createdAt' | 'updatedAt';

  @Property({ type: 'datetime', onCreate: () => new Date() })
  createdAt!: Date;

  @Property({ type: 'datetime', onUpdate: () => new Date(), nullable: true })
  updatedAt: Date | null = null;
}
